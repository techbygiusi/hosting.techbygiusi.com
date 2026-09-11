#!/usr/bin/env python3
import hashlib
import json
import os
import pathlib
import shutil
import stat
import subprocess
import sys
import tempfile
import zipfile
from datetime import datetime, timezone

PROJECT_DIR = pathlib.Path(os.environ.get('HOSTING_PORTAL_PROJECT_DIR', '/opt/hosting.techbygiusi.com'))
DATA_DIR = PROJECT_DIR / 'backend' / 'data'
REQUEST_PATH = DATA_DIR / 'system-update-request.json'
STATUS_PATH = DATA_DIR / 'system-update-status.json'
LOG_PATH = DATA_DIR / 'system-update.log'
TIMEZONE_PATH = DATA_DIR / 'system-timezone.txt'
VERSION_PATH = DATA_DIR / 'system-updater-version'
PACKAGE_DIR = DATA_DIR / 'update-packages'
PACKAGE_STATE_PATH = DATA_DIR / 'portal-package-state.json'
HELPER_TARGET = pathlib.Path('/usr/local/sbin/hosting-portal-updater')
HELPER_VERSION = 4
MAX_INSTALLED_PACKAGES = 5


def now():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    os.replace(temp, path)


def read_json(path, fallback=None):
    try:
        return json.loads(path.read_text(encoding='utf-8'))
    except Exception:
        return fallback


def append_log(line):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open('a', encoding='utf-8') as handle:
        handle.write(str(line).rstrip('\n') + '\n')


def update_status(status, **patch):
    status.update(patch)
    write_json(STATUS_PATH, status)


def set_step(status, steps, index, state, message=None):
    steps[index]['status'] = state
    if state == 'running':
        steps[index]['startedAt'] = now()
    if state in ('done', 'failed'):
        steps[index]['finishedAt'] = now()
    if message:
        steps[index]['message'] = message
    progress_done = sum(1 for step in steps if step['status'] == 'done')
    progress = round((progress_done / max(len(steps), 1)) * 100)
    if state == 'running':
        progress = max(progress, round((index / max(len(steps), 1)) * 100))
    update_status(status, steps=steps, progress=progress, currentStep=steps[index]['label'])


def run_command(status, steps, index, command, cwd=None, env=None):
    set_step(status, steps, index, 'running')
    append_log(f"\n=== {steps[index]['label']} ===")
    append_log('$ ' + ' '.join(command))
    process = subprocess.Popen(
        command,
        cwd=str(cwd) if cwd else None,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert process.stdout is not None
    for line in process.stdout:
        append_log(line.rstrip('\n'))
    code = process.wait()
    if code != 0:
        failure_message = f"{steps[index]['label']} failed with exit code {code}"
        set_step(status, steps, index, 'failed', f'Command exited with code {code}')
        update_status(
            status,
            status='failed',
            steps=steps,
            currentStep='Update failed',
            finishedAt=now(),
            error=failure_message,
        )
        append_log(f'Update failed: {failure_message}')
        raise RuntimeError(failure_message)
    set_step(status, steps, index, 'done')


def sha256_file(path):
    digest = hashlib.sha256()
    with path.open('rb') as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def safe_extract_zip(package_path, destination):
    with zipfile.ZipFile(package_path, 'r') as archive:
        members = archive.infolist()
        if not members:
            raise RuntimeError('Uploaded portal package is empty')
        for info in members:
            name = info.filename
            if '\\' in name or '\x00' in name:
                raise RuntimeError('Portal package contains an unsafe path')
            pure = pathlib.PurePosixPath(name)
            if pure.is_absolute() or '..' in pure.parts:
                raise RuntimeError('Portal package contains an unsafe path')
            mode = info.external_attr >> 16
            if mode and stat.S_ISLNK(mode):
                raise RuntimeError('Portal package may not contain symbolic links')
        archive.extractall(destination)


def is_portal_root(path):
    return (
        path.is_dir()
        and (path / 'docker-compose.yml').is_file()
        and (path / 'backend' / 'package.json').is_file()
        and (path / 'frontend' / 'package.json').is_file()
    )


def find_portal_root(extract_dir):
    candidates = []
    if is_portal_root(extract_dir):
        candidates.append(extract_dir)
    for child in extract_dir.iterdir():
        if child.name == '__MACOSX':
            continue
        if is_portal_root(child):
            candidates.append(child)
    if len(candidates) != 1:
        raise RuntimeError('ZIP must contain exactly one Hosting Portal project')
    return candidates[0]


def remove_path(path):
    if not path.exists() and not path.is_symlink():
        return
    if path.is_dir() and not path.is_symlink():
        shutil.rmtree(path)
    else:
        path.unlink()


def copy_entry(source, target):
    if source.is_dir():
        shutil.copytree(source, target, copy_function=shutil.copy2)
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, target)


def install_project_source(source_root):
    PROJECT_DIR.mkdir(parents=True, exist_ok=True)

    for source in source_root.iterdir():
        name = source.name
        # Runtime configuration and any existing repository metadata are local
        # state, not release content.
        if name in {'.env', '.git'}:
            continue

        if name == 'backend' and source.is_dir():
            target_backend = PROJECT_DIR / 'backend'
            target_backend.mkdir(parents=True, exist_ok=True)
            for existing in list(target_backend.iterdir()):
                if existing.name == 'data':
                    continue
                remove_path(existing)
            for child in source.iterdir():
                if child.name == 'data':
                    continue
                copy_entry(child, target_backend / child.name)
            continue

        target = PROJECT_DIR / name
        remove_path(target)
        copy_entry(source, target)

    new_helper = PROJECT_DIR / 'scripts' / 'host_updater.py'
    if not new_helper.is_file():
        raise RuntimeError('Portal package does not contain scripts/host_updater.py')
    shutil.copy2(new_helper, HELPER_TARGET)
    HELPER_TARGET.chmod(0o755)
    VERSION_PATH.write_text(str(HELPER_VERSION) + '\n', encoding='utf-8')


def package_time(entry):
    value = str(entry.get('lastInstalledAt') or entry.get('installedAt') or entry.get('uploadedAt') or '') if isinstance(entry, dict) else ''
    try:
        return datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp()
    except Exception:
        return 0


def prune_package_history(state):
    packages = [item for item in state.get('packages', []) if isinstance(item, dict)] if isinstance(state.get('packages'), list) else []
    current = state.get('current') if isinstance(state.get('current'), dict) else None
    pending = state.get('pending') if isinstance(state.get('pending'), dict) else None
    by_id = {str(item.get('id')): item for item in packages if item.get('id')}
    if current and current.get('id'):
        by_id[str(current.get('id'))] = current
    if pending and pending.get('id'):
        by_id[str(pending.get('id'))] = pending

    current_id = str(current.get('id')) if current and current.get('id') else ''
    installed = [item for item in by_id.values() if item.get('status') == 'installed' or (current_id and str(item.get('id')) == current_id)]
    installed.sort(key=package_time, reverse=True)
    keep_installed = installed[:MAX_INSTALLED_PACKAGES]
    keep_ids = {str(item.get('id')) for item in keep_installed if item.get('id')}
    if pending and pending.get('id'):
        keep_ids.add(str(pending.get('id')))

    for item in list(by_id.values()):
        item_id = str(item.get('id') or '')
        if not item_id or item_id in keep_ids:
            continue
        stored_name = pathlib.Path(str(item.get('storedFilename') or '')).name
        if stored_name:
            try:
                (PACKAGE_DIR / stored_name).unlink()
                append_log(f'Removed old portal package: {item.get("version") or item.get("originalFilename") or stored_name}')
            except FileNotFoundError:
                pass
            except Exception as exc:
                append_log(f'Could not remove old portal package {stored_name}: {exc}')

    kept = [item for item in by_id.values() if str(item.get('id') or '') in keep_ids]
    kept.sort(key=lambda item: str(item.get('uploadedAt') or ''))
    state['packages'] = kept
    if current_id:
        state['current'] = next((item for item in kept if str(item.get('id')) == current_id), current)
    if pending and pending.get('id'):
        pending_id = str(pending.get('id'))
        state['pending'] = next((item for item in kept if str(item.get('id')) == pending_id), pending)
    return state


def mark_package_installed(request):
    state = read_json(PACKAGE_STATE_PATH, {}) or {}
    package_id = str(request.get('packageId') or '')
    pending = state.get('pending') if isinstance(state.get('pending'), dict) else None
    packages = [item for item in state.get('packages', []) if isinstance(item, dict)] if isinstance(state.get('packages'), list) else []
    selected = next((item for item in packages if str(item.get('id') or '') == package_id), None)
    if selected is None and pending and (not package_id or str(pending.get('id') or '') == package_id):
        selected = pending
    if selected is None:
        return

    installed_at = now()
    installed = {
        **selected,
        'status': 'installed',
        'installedAt': selected.get('installedAt') or installed_at,
        'lastInstalledAt': installed_at,
        'commit': request.get('packageCommit') or selected.get('commit') or '',
    }
    replaced = False
    updated_packages = []
    for item in packages:
        if str(item.get('id') or '') == str(installed.get('id') or ''):
            updated_packages.append(installed)
            replaced = True
        else:
            updated_packages.append(item)
    if not replaced:
        updated_packages.append(installed)

    rollback = bool(request.get('rollback'))
    next_pending = pending
    if not rollback and pending and str(pending.get('id') or '') == str(installed.get('id') or ''):
        next_pending = None

    next_state = prune_package_history({
        'current': installed,
        'pending': next_pending,
        'packages': updated_packages,
    })
    write_json(PACKAGE_STATE_PATH, next_state)


def prepare_portal_package(status, steps, request):
    package_name = pathlib.Path(str(request.get('packageFilename') or '')).name
    if not package_name or package_name != str(request.get('packageFilename') or ''):
        raise RuntimeError('Portal update request contains an invalid package filename')
    package_path = PACKAGE_DIR / package_name
    if not package_path.is_file():
        raise RuntimeError(f'Uploaded portal package was not found: {package_name}')

    expected_hash = str(request.get('packageSha256') or '').strip().lower()
    set_step(status, steps, 0, 'running')
    append_log(f"\n=== {steps[0]['label']} ===")
    append_log(f"Package: {request.get('packageOriginalFilename') or package_name}")
    actual_hash = sha256_file(package_path)
    if expected_hash and actual_hash != expected_hash:
        set_step(status, steps, 0, 'failed', 'SHA-256 verification failed')
        raise RuntimeError('Uploaded portal package checksum does not match')

    staging_dir = pathlib.Path(tempfile.mkdtemp(prefix='hosting-portal-update-'))
    try:
        safe_extract_zip(package_path, staging_dir)
        source_root = find_portal_root(staging_dir)
        append_log(f'Validated package SHA-256: {actual_hash}')
        set_step(status, steps, 0, 'done')

        set_step(status, steps, 1, 'running')
        append_log(f"\n=== {steps[1]['label']} ===")
        append_log(f'Installing package into {PROJECT_DIR}')
        install_project_source(source_root)
        append_log('Portal source installed. Persistent backend/data and local .env were preserved.')
        set_step(status, steps, 1, 'done')
    finally:
        shutil.rmtree(staging_dir, ignore_errors=True)


def main():
    if not REQUEST_PATH.exists():
        return 0

    try:
        request = json.loads(REQUEST_PATH.read_text(encoding='utf-8'))
    except Exception as exc:
        append_log(f'Could not read update request: {exc}')
        return 1
    finally:
        try:
            REQUEST_PATH.unlink()
        except FileNotFoundError:
            pass

    update_type = str(request.get('type', '')).lower()
    update_id = request.get('id')
    if update_type == 'os':
        steps = [
            {'key': 'apt-refresh', 'label': 'Refresh Debian package lists', 'status': 'pending'},
            {'key': 'apt-upgrade', 'label': 'Install host updates', 'status': 'pending'},
        ]
    elif update_type == 'portal':
        rollback = bool(request.get('rollback'))
        steps = [
            {'key': 'package-validate', 'label': 'Validate rollback package' if rollback else 'Validate uploaded package', 'status': 'pending'},
            {'key': 'package-install', 'label': 'Restore portal package' if rollback else 'Install portal package', 'status': 'pending'},
            {'key': 'compose-build', 'label': 'Build and restart portal', 'status': 'pending'},
            {'key': 'image-prune', 'label': 'Prune unused Docker images', 'status': 'pending'},
        ]
    elif update_type == 'timezone':
        steps = [
            {'key': 'timezone', 'label': 'Set host timezone', 'status': 'pending'},
        ]
    else:
        write_json(STATUS_PATH, {
            'id': update_id,
            'type': update_type,
            'status': 'failed',
            'progress': 0,
            'currentStep': '',
            'steps': [],
            'startedAt': now(),
            'finishedAt': now(),
            'error': 'Unsupported update type'
        })
        return 1

    target_timezone = str(request.get('timezone', '')).strip() if update_type == 'timezone' else ''
    status = {
        'id': update_id,
        'type': update_type,
        'status': 'running',
        'progress': 0,
        'currentStep': steps[0]['label'],
        'steps': steps,
        'startedAt': now(),
        'finishedAt': None,
        'error': '',
        **({'targetTimezone': target_timezone} if target_timezone else {}),
        **({'rollback': bool(request.get('rollback')), 'package': {
            'id': request.get('packageId'),
            'version': request.get('packageVersion') or '',
            'commit': request.get('packageCommit') or '',
            'originalFilename': request.get('packageOriginalFilename') or '',
        }} if update_type == 'portal' else {})
    }
    write_json(STATUS_PATH, status)
    append_log(f"Update {update_id} started at {status['startedAt']} ({update_type})")

    try:
        if update_type == 'os':
            run_command(status, steps, 0, ['apt-get', 'update'])
            env = os.environ.copy()
            env['DEBIAN_FRONTEND'] = 'noninteractive'
            env['NEEDRESTART_MODE'] = 'l'
            run_command(status, steps, 1, ['apt-get', '-y', 'upgrade'], env=env)
        elif update_type == 'portal':
            if not PROJECT_DIR.exists():
                raise RuntimeError(f'Project directory does not exist: {PROJECT_DIR}')
            prepare_portal_package(status, steps, request)
            docker_env = os.environ.copy()
            docker_env['COMPOSE_ANSI'] = 'never'
            docker_env['BUILDKIT_PROGRESS'] = 'plain'
            run_command(status, steps, 2, ['docker', 'compose', 'up', '--build', '-d'], cwd=PROJECT_DIR, env=docker_env)
            run_command(status, steps, 3, ['docker', 'image', 'prune', '-f'], cwd=PROJECT_DIR, env=docker_env)
            mark_package_installed(request)
        else:
            if not target_timezone:
                raise RuntimeError('Timezone is missing')
            run_command(status, steps, 0, ['timedatectl', 'set-timezone', target_timezone])
            timezone_result = subprocess.run(
                ['timedatectl', 'show', '--property=Timezone', '--value'],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
            current_timezone = timezone_result.stdout.strip() or target_timezone
            TIMEZONE_PATH.write_text(current_timezone + '\n', encoding='utf-8')
            status['hostTimezone'] = current_timezone

        update_status(
            status,
            status='completed',
            progress=100,
            currentStep='Update completed',
            steps=steps,
            finishedAt=now(),
            error='',
            **({'hostTimezone': status.get('hostTimezone')} if status.get('hostTimezone') else {})
        )
        append_log('Update completed successfully.')
        return 0
    except Exception as exc:
        # If a custom step failed outside run_command, mark the active step as
        # failed so the portal can always recover the terminal status.
        for index, step in enumerate(steps):
            if step.get('status') == 'running':
                set_step(status, steps, index, 'failed', str(exc))
                break
        update_status(
            status,
            status='failed',
            steps=steps,
            currentStep='Update failed',
            finishedAt=now(),
            error=str(exc)
        )
        append_log(f'Update failed: {exc}')
        return 1


if __name__ == '__main__':
    sys.exit(main())
