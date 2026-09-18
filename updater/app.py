#!/usr/bin/env python3
import datetime as dt
import hmac
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
import threading
import time
import uuid
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

PORT = int(os.environ.get('UPDATER_PORT', '3010'))
TOKEN = os.environ.get('UPDATER_TOKEN', '')
WORKSPACE = Path(os.environ.get('PROJECT_DIR', '/workspace')).resolve()
STATE_ROOT = Path(os.environ.get('UPDATE_STATE_DIR', '/workspace/data/updates')).resolve()
STAGING_DIR = STATE_ROOT / 'staging'
VERSIONS_DIR = STATE_ROOT / 'versions'
WORK_DIR = STATE_ROOT / 'work'
STATE_FILE = STATE_ROOT / 'state.json'
LOCK_FILE = STATE_ROOT / '.operation.lock'
MAX_VERSIONS = int(os.environ.get('UPDATE_KEEP_VERSIONS', '5'))
MAX_ARCHIVE_BYTES = int(os.environ.get('UPDATE_MAX_ARCHIVE_MB', '250')) * 1024 * 1024
MAX_UNPACKED_BYTES = int(os.environ.get('UPDATE_MAX_UNPACKED_MB', '750')) * 1024 * 1024
MAX_ENTRIES = 6000
REQUIRED_FILES = {
    'VERSION',
    'AI_README.md',
    'docker-compose.yml',
    'backend/app.js',
    'backend/Dockerfile',
    'frontend/index.html',
    'frontend/src/main.jsx',
    'frontend/src/pages/AdminPage.jsx',
    'updater/app.py',
    'updater/Dockerfile',
}
PRESERVE_ROOT = {'.env', 'data'}
VERSION_RE = re.compile(r'^\d+\.\d{2,}$')
operation_lock = threading.Lock()


def now_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00', 'Z')


def ensure_dirs():
    for directory in (STATE_ROOT, STAGING_DIR, VERSIONS_DIR, WORK_DIR):
        directory.mkdir(parents=True, exist_ok=True)


def default_state():
    return {
        'staged': None,
        'operation': {
            'status': 'idle',
            'action': None,
            'targetVersion': None,
            'message': 'Bereit.',
            'startedAt': None,
            'finishedAt': None,
        },
        'versions': [],
    }


def read_state():
    ensure_dirs()
    try:
        value = json.loads(STATE_FILE.read_text('utf-8'))
        if isinstance(value, dict):
            base = default_state()
            base.update(value)
            if not isinstance(base.get('versions'), list):
                base['versions'] = []
            if not isinstance(base.get('operation'), dict):
                base['operation'] = default_state()['operation']
            return base
    except Exception:
        pass
    return default_state()


def write_state(state):
    ensure_dirs()
    temp = STATE_FILE.with_suffix(f'.{os.getpid()}.{uuid.uuid4().hex}.tmp')
    temp.write_text(json.dumps(state, indent=2, ensure_ascii=False) + '\n', 'utf-8')
    os.replace(temp, STATE_FILE)


def current_version():
    version_file = WORKSPACE / 'VERSION'
    try:
        value = version_file.read_text('utf-8').strip()
        return value if VERSION_RE.fullmatch(value) else 'unbekannt'
    except Exception:
        return 'unbekannt'


def parse_version(value):
    if not VERSION_RE.fullmatch(str(value or '')):
        raise ValueError('Ungültiges Versionsformat. Erwartet wird z. B. 1.01, 1.02, 1.03.')
    major, minor = str(value).split('.', 1)
    return int(major), int(minor)


def is_newer(candidate, installed):
    if not VERSION_RE.fullmatch(str(installed or '')):
        return True
    return parse_version(candidate) > parse_version(installed)


def archive_root_info(archive_path):
    archive_path = Path(archive_path).resolve()
    if not archive_path.is_file():
        raise ValueError('Die hochgeladene ZIP wurde nicht gefunden.')
    if archive_path.stat().st_size > MAX_ARCHIVE_BYTES:
        raise ValueError('Die Update-ZIP ist zu groß.')

    with zipfile.ZipFile(archive_path, 'r') as archive:
        infos = archive.infolist()
        if not infos or len(infos) > MAX_ENTRIES:
            raise ValueError('Die ZIP ist leer oder enthält zu viele Dateien.')

        total_unpacked = 0
        safe_names = []
        for info in infos:
            raw = info.filename.replace('\\', '/')
            if raw.startswith('/') or re.match(r'^[A-Za-z]:', raw):
                raise ValueError('Die ZIP enthält einen ungültigen absoluten Pfad.')
            parts = [part for part in raw.split('/') if part not in ('', '.')]
            if '..' in parts:
                raise ValueError('Die ZIP enthält einen unsicheren Pfad.')
            mode = (info.external_attr >> 16) & 0o170000
            if mode == stat.S_IFLNK:
                raise ValueError('Symbolische Links sind in Update-ZIPs nicht erlaubt.')
            total_unpacked += max(0, int(info.file_size or 0))
            if total_unpacked > MAX_UNPACKED_BYTES:
                raise ValueError('Die entpackte Update-ZIP wäre zu groß.')
            if parts:
                safe_names.append('/'.join(parts))

        candidates = []
        roots = {name.split('/', 1)[0] for name in safe_names}
        if 'VERSION' in safe_names:
            candidates.append('')
        if len(roots) == 1:
            only = next(iter(roots))
            if f'{only}/VERSION' in safe_names:
                candidates.append(only)
        if not candidates:
            for root in roots:
                if f'{root}/VERSION' in safe_names:
                    candidates.append(root)
        if len(candidates) != 1:
            raise ValueError('Die ZIP muss genau ein Picly-Projekt mit einer VERSION-Datei enthalten.')

        root = candidates[0]
        prefix = f'{root}/' if root else ''
        relative_files = {
            name[len(prefix):]
            for name in safe_names
            if name.startswith(prefix) and len(name) > len(prefix) and not name.endswith('/')
        }

        missing = sorted(REQUIRED_FILES - relative_files)
        if missing:
            raise ValueError('Die Update-ZIP ist unvollständig. Fehlt: ' + ', '.join(missing[:6]))

        forbidden = [
            name for name in relative_files
            if name == '.env' or name.startswith('data/') or name.startswith('.git/')
            or name.lower() in {'changelog', 'changelog.md', 'changelog.txt'}
        ]
        if forbidden:
            raise ValueError('Die Update-ZIP enthält nicht erlaubte Laufzeit-/Historien-Dateien: ' + ', '.join(sorted(forbidden)[:5]))

        version_member = prefix + 'VERSION'
        version = archive.read(version_member).decode('utf-8', errors='strict').strip()
        parse_version(version)
        return {'version': version, 'root': root, 'prefix': prefix, 'files': relative_files}


def staged_path(filename):
    safe = Path(str(filename or '')).name
    if not safe or safe != str(filename or ''):
        raise ValueError('Ungültige Update-ID.')
    candidate = (STAGING_DIR / safe).resolve()
    if candidate.parent != STAGING_DIR.resolve():
        raise ValueError('Ungültiger Update-Pfad.')
    return candidate


def validate_stage(filename, remember=True):
    path = staged_path(filename)
    info = archive_root_info(path)
    installed = current_version()
    if not is_newer(info['version'], installed):
        raise ValueError(f'Version {info["version"]} ist nicht neuer als die installierte Version {installed}. Für ältere Versionen bitte Rollback verwenden.')

    if remember:
        state = read_state()
        previous = state.get('staged')
        if previous and previous.get('file') and previous.get('file') != filename:
            try:
                staged_path(previous['file']).unlink(missing_ok=True)
            except Exception:
                pass
        state['staged'] = {
            'id': filename,
            'file': filename,
            'version': info['version'],
            'size': path.stat().st_size,
            'uploadedAt': now_iso(),
        }
        write_state(state)
    return info


def zip_current_project(version, destination):
    destination = Path(destination)
    temp = destination.with_suffix('.tmp')
    if temp.exists():
        temp.unlink()
    with zipfile.ZipFile(temp, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for root, dirs, files in os.walk(WORKSPACE):
            root_path = Path(root)
            relative_root = root_path.relative_to(WORKSPACE)
            dirs[:] = [d for d in dirs if not (relative_root == Path('.') and d in {'data', '.git'}) and d not in {'node_modules', '__pycache__'}]
            for file_name in files:
                file_path = root_path / file_name
                relative = file_path.relative_to(WORKSPACE)
                if relative == Path('.env') or relative.parts[0] in {'data', '.git'}:
                    continue
                archive.write(file_path, arcname=f'picly/{relative.as_posix()}')
    os.replace(temp, destination)


def ensure_version_archive(version):
    if not VERSION_RE.fullmatch(str(version or '')):
        return None
    destination = VERSIONS_DIR / f'picly-{version}.zip'
    if not destination.exists():
        zip_current_project(version, destination)
    state = read_state()
    entries = [entry for entry in state['versions'] if entry.get('version') != version]
    entries.append({
        'version': version,
        'file': destination.name,
        'installedAt': now_iso(),
        'source': 'snapshot',
    })
    state['versions'] = entries
    write_state(state)
    return destination


def register_version_archive(version, source_archive, source='upload'):
    destination = VERSIONS_DIR / f'picly-{version}.zip'
    source_path = Path(source_archive).resolve()
    if source_path != destination.resolve():
        shutil.copy2(source_path, destination)
    state = read_state()
    entries = [entry for entry in state['versions'] if entry.get('version') != version]
    entries.append({
        'version': version,
        'file': destination.name,
        'installedAt': now_iso(),
        'source': source,
    })
    state['versions'] = entries
    write_state(state)
    return destination


def prune_versions():
    state = read_state()
    installed = current_version()
    entries = []
    seen = set()
    for entry in reversed(state.get('versions', [])):
        version = str(entry.get('version') or '')
        file_name = str(entry.get('file') or '')
        if not VERSION_RE.fullmatch(version) or version in seen:
            continue
        archive = VERSIONS_DIR / Path(file_name).name
        if not archive.is_file():
            continue
        seen.add(version)
        entries.append(entry)
    entries.reverse()

    if len(entries) > MAX_VERSIONS:
        keep = entries[-MAX_VERSIONS:]
        if installed in {entry.get('version') for entry in entries} and installed not in {entry.get('version') for entry in keep}:
            keep[0] = next(entry for entry in entries if entry.get('version') == installed)
        keep_versions = {entry.get('version') for entry in keep}
        for entry in entries:
            if entry.get('version') not in keep_versions:
                try:
                    (VERSIONS_DIR / Path(entry['file']).name).unlink(missing_ok=True)
                except Exception:
                    pass
        entries = keep

    state['versions'] = entries
    write_state(state)


def safe_extract(archive_path, target):
    info = archive_root_info(archive_path)
    target = Path(target)
    target.mkdir(parents=True, exist_ok=True)
    prefix = info['prefix']
    with zipfile.ZipFile(archive_path, 'r') as archive:
        for member in archive.infolist():
            raw = member.filename.replace('\\', '/')
            if prefix and not raw.startswith(prefix):
                continue
            rel = raw[len(prefix):] if prefix else raw
            rel = rel.strip('/')
            if not rel:
                continue
            dest = (target / rel).resolve()
            if target.resolve() not in dest.parents and dest != target.resolve():
                raise ValueError('Unsicherer Pfad in ZIP.')
            if member.is_dir():
                dest.mkdir(parents=True, exist_ok=True)
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(member, 'r') as source, open(dest, 'wb') as output:
                shutil.copyfileobj(source, output)
            permissions = (member.external_attr >> 16) & 0o777
            if permissions:
                os.chmod(dest, permissions)
    return info


def validate_extracted_compose(extracted):
    env_file = WORKSPACE / '.env'
    cmd = ['docker', 'compose', '--project-directory', str(extracted)]
    if env_file.exists():
        cmd.extend(['--env-file', str(env_file)])
    cmd.extend(['-f', str(Path(extracted) / 'docker-compose.yml'), 'config'])
    result = subprocess.run(cmd, cwd=extracted, text=True, capture_output=True, timeout=120)
    if result.returncode != 0:
        message = (result.stderr or result.stdout or '').strip()
        raise RuntimeError(message[-5000:] or 'docker-compose.yml ist ungültig.')


def clear_project_code():
    for entry in WORKSPACE.iterdir():
        if entry.name in PRESERVE_ROOT:
            continue
        if entry.is_dir() and not entry.is_symlink():
            shutil.rmtree(entry)
        else:
            entry.unlink(missing_ok=True)


def copy_tree(source, destination):
    for item in Path(source).iterdir():
        target = Path(destination) / item.name
        if item.is_dir():
            shutil.copytree(item, target, dirs_exist_ok=True)
        else:
            shutil.copy2(item, target)
    for script in WORKSPACE.glob('*.sh'):
        script.chmod(script.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP)


def compose_cmd(*args):
    env_file = WORKSPACE / '.env'
    cmd = ['docker', 'compose', '--project-directory', str(WORKSPACE)]
    if env_file.exists():
        cmd.extend(['--env-file', str(env_file)])
    cmd.extend(['-f', str(WORKSPACE / 'docker-compose.yml')])
    cmd.extend(args)
    return cmd


def run(cmd, timeout=900):
    result = subprocess.run(cmd, cwd=WORKSPACE, text=True, capture_output=True, timeout=timeout)
    if result.returncode != 0:
        message = (result.stderr or result.stdout or '').strip()
        raise RuntimeError(message[-5000:] or f'Befehl fehlgeschlagen: {cmd}')
    return (result.stdout or '').strip()


def wait_healthy(container_name, timeout=180):
    deadline = time.time() + timeout
    last = ''
    while time.time() < deadline:
        result = subprocess.run(
            ['docker', 'inspect', '-f', '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}', container_name],
            text=True,
            capture_output=True,
        )
        if result.returncode == 0:
            last = result.stdout.strip()
            if last in {'healthy', 'running'}:
                return
            if last in {'unhealthy', 'exited', 'dead'}:
                raise RuntimeError(f'{container_name} ist {last}.')
        time.sleep(2)
    raise RuntimeError(f'{container_name} wurde nicht rechtzeitig gesund (Status: {last or "unbekannt"}).')


def deploy_workspace():
    run(compose_cmd('config'), timeout=120)
    run(compose_cmd('build', 'backend', 'frontend', 'updater'), timeout=1200)
    # --no-deps verhindert, dass der laufende Updater sich während seines
    # eigenen Update-Vorgangs als Backend-Abhängigkeit selbst neu erstellt.
    run(compose_cmd('up', '-d', '--no-deps', 'backend'), timeout=300)
    wait_healthy('picly-backend')
    run(compose_cmd('up', '-d', '--no-deps', 'frontend'), timeout=300)
    wait_healthy('picly-frontend')


def restore_archive(archive_path):
    with tempfile.TemporaryDirectory(dir=WORK_DIR) as temp_dir:
        extracted = Path(temp_dir) / 'release'
        safe_extract(archive_path, extracted)
        clear_project_code()
        copy_tree(extracted, WORKSPACE)
    deploy_workspace()


def set_operation(status, action=None, target=None, message=None, started=None, finished=None):
    state = read_state()
    state['operation'] = {
        'status': status,
        'action': action,
        'targetVersion': target,
        'message': message or '',
        'startedAt': started,
        'finishedAt': finished,
    }
    write_state(state)


def perform_install(archive_path, target_version, action):
    started = now_iso()
    previous_version = current_version()
    previous_archive = None
    try:
        set_operation('running', action, target_version, f'Version {target_version} wird installiert …', started, None)
        previous_archive = ensure_version_archive(previous_version)

        with tempfile.TemporaryDirectory(dir=WORK_DIR) as temp_dir:
            extracted = Path(temp_dir) / 'release'
            info = safe_extract(archive_path, extracted)
            if info['version'] != target_version:
                raise RuntimeError('Versionsprüfung der ZIP ist fehlgeschlagen.')

            validate_extracted_compose(extracted)
            clear_project_code()
            copy_tree(extracted, WORKSPACE)
            deploy_workspace()

        register_version_archive(target_version, archive_path, 'upload' if action == 'install' else 'rollback')
        try:
            archive_resolved = Path(archive_path).resolve()
            if archive_resolved.parent == STAGING_DIR.resolve():
                archive_resolved.unlink(missing_ok=True)
        except Exception:
            pass
        state = read_state()
        state['staged'] = None
        state['operation'] = {
            'status': 'success',
            'action': action,
            'targetVersion': target_version,
            'message': f'Version {target_version} wurde erfolgreich installiert.',
            'startedAt': started,
            'finishedAt': now_iso(),
        }
        write_state(state)
        prune_versions()
    except Exception as error:
        recovery = ''
        if previous_archive and Path(previous_archive).is_file():
            try:
                restore_archive(previous_archive)
                recovery = f' Die vorherige Version {previous_version} wurde automatisch wiederhergestellt.'
            except Exception as rollback_error:
                recovery = f' Automatische Wiederherstellung fehlgeschlagen: {rollback_error}'
        set_operation('error', action, target_version, f'Update fehlgeschlagen: {error}.{recovery}', started, now_iso())
    finally:
        try:
            LOCK_FILE.unlink(missing_ok=True)
        except Exception:
            pass
        operation_lock.release()
        # app.py liegt im gebundenen Projektverzeichnis. Nach einem erfolgreichen
        # Austausch lädt der Prozess die neue Fassung ohne Container-Neustart.
        if current_version() == target_version:
            threading.Timer(2.0, reload_self).start()


def reload_self():
    try:
        os.execv(sys.executable, [sys.executable, str(WORKSPACE / 'updater' / 'app.py')])
    except Exception:
        pass


def start_operation(archive_path, version, action):
    if not operation_lock.acquire(blocking=False):
        raise RuntimeError('Es läuft bereits ein Update oder Rollback.')
    try:
        ensure_dirs()
        LOCK_FILE.write_text(json.dumps({'pid': os.getpid(), 'startedAt': now_iso()}) + '\n', 'utf-8')
        thread = threading.Thread(target=perform_install, args=(str(archive_path), version, action), daemon=True)
        thread.start()
    except Exception:
        operation_lock.release()
        raise


def public_status():
    state = read_state()
    installed = current_version()
    versions = []
    seen = set()
    for entry in reversed(state.get('versions', [])):
        version = str(entry.get('version') or '')
        if version in seen or not VERSION_RE.fullmatch(version):
            continue
        archive = VERSIONS_DIR / Path(str(entry.get('file') or '')).name
        if not archive.is_file():
            continue
        seen.add(version)
        versions.append({
            'version': version,
            'installedAt': entry.get('installedAt'),
            'current': version == installed,
            'available': True,
        })
    versions.reverse()
    if installed not in seen and VERSION_RE.fullmatch(installed):
        versions.append({'version': installed, 'installedAt': None, 'current': True, 'available': False})
    versions = versions[-MAX_VERSIONS:]
    return {
        'currentVersion': installed,
        'keepVersions': MAX_VERSIONS,
        'staged': state.get('staged'),
        'operation': state.get('operation') or default_state()['operation'],
        'versions': versions,
    }


class Handler(BaseHTTPRequestHandler):
    server_version = 'PiclyUpdater/1.0'

    def log_message(self, fmt, *args):
        sys.stdout.write('[updater] ' + (fmt % args) + '\n')
        sys.stdout.flush()

    def send_json(self, status, payload):
        data = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def authorized(self):
        if not TOKEN:
            return False
        supplied = self.headers.get('X-Updater-Token', '')
        return hmac.compare_digest(supplied, TOKEN)

    def read_json(self):
        length = int(self.headers.get('Content-Length', '0') or '0')
        if length > 64 * 1024:
            raise ValueError('Request zu groß.')
        raw = self.rfile.read(length) if length else b'{}'
        return json.loads(raw.decode('utf-8') or '{}')

    def do_GET(self):
        path = urlparse(self.path).path
        if path == '/health':
            return self.send_json(200, {'ok': True, 'app': 'Picly Updater', 'version': current_version()})
        if path == '/status':
            if not self.authorized():
                return self.send_json(401, {'message': 'Nicht autorisiert.'})
            return self.send_json(200, public_status())
        return self.send_json(404, {'message': 'Nicht gefunden.'})

    def do_POST(self):
        path = urlparse(self.path).path
        if not self.authorized():
            return self.send_json(401, {'message': 'Nicht autorisiert.'})
        try:
            body = self.read_json()
            if path == '/validate':
                filename = str(body.get('file') or '')
                info = validate_stage(filename, remember=True)
                return self.send_json(200, {'ok': True, 'version': info['version'], 'status': public_status()})

            if path == '/install':
                state = read_state()
                staged = state.get('staged') or {}
                filename = str(staged.get('file') or '')
                if not filename:
                    raise ValueError('Bitte zuerst eine Update-ZIP hochladen.')
                info = validate_stage(filename, remember=False)
                archive = staged_path(filename)
                start_operation(archive, info['version'], 'install')
                return self.send_json(202, {'ok': True, 'message': f'Update auf {info["version"]} wurde gestartet.', 'status': public_status()})

            if path == '/rollback':
                version = str(body.get('version') or '')
                parse_version(version)
                state = read_state()
                match = next((entry for entry in state.get('versions', []) if entry.get('version') == version), None)
                if not match:
                    raise ValueError(f'Version {version} ist nicht mehr als Rollback vorhanden.')
                archive = (VERSIONS_DIR / Path(str(match.get('file') or '')).name).resolve()
                if archive.parent != VERSIONS_DIR.resolve() or not archive.is_file():
                    raise ValueError('Rollback-Archiv wurde nicht gefunden.')
                if version == current_version():
                    raise ValueError(f'Version {version} ist bereits installiert.')
                archive_root_info(archive)
                start_operation(archive, version, 'rollback')
                return self.send_json(202, {'ok': True, 'message': f'Rollback auf {version} wurde gestartet.', 'status': public_status()})

            return self.send_json(404, {'message': 'Nicht gefunden.'})
        except ValueError as error:
            return self.send_json(400, {'message': str(error)})
        except RuntimeError as error:
            return self.send_json(409, {'message': str(error)})
        except Exception as error:
            return self.send_json(500, {'message': f'Updater-Fehler: {error}'})


def main():
    ensure_dirs()
    # Eine veraltete Lock-Datei nach Container-/Host-Neustart blockiert nichts.
    try:
        LOCK_FILE.unlink(missing_ok=True)
    except Exception:
        pass
    state = read_state()
    if state.get('operation', {}).get('status') == 'running':
        state['operation'] = {
            'status': 'error',
            'action': state.get('operation', {}).get('action'),
            'targetVersion': state.get('operation', {}).get('targetVersion'),
            'message': 'Der letzte Update-Vorgang wurde durch einen Neustart unterbrochen. Bitte Status prüfen und den Vorgang erneut starten.',
            'startedAt': state.get('operation', {}).get('startedAt'),
            'finishedAt': now_iso(),
        }
        write_state(state)
    server = ThreadingHTTPServer(('0.0.0.0', PORT), Handler)
    print(f'Picly updater listening on port {PORT}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
