#!/usr/bin/env python3
import json
import os
import pathlib
import subprocess
import sys
import time
from datetime import datetime, timezone

PROJECT_DIR = pathlib.Path(os.environ.get('HOSTING_PORTAL_PROJECT_DIR', '/opt/hosting.techbygiusi.com'))
DATA_DIR = PROJECT_DIR / 'backend' / 'data'
REQUEST_PATH = DATA_DIR / 'system-update-request.json'
STATUS_PATH = DATA_DIR / 'system-update-status.json'
LOG_PATH = DATA_DIR / 'system-update.log'
TIMEZONE_PATH = DATA_DIR / 'system-timezone.txt'


def now():
    return datetime.now(timezone.utc).isoformat()


def write_json(path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_suffix(path.suffix + '.tmp')
    temp.write_text(json.dumps(payload, indent=2), encoding='utf-8')
    os.replace(temp, path)


def append_log(line):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with LOG_PATH.open('a', encoding='utf-8') as handle:
        handle.write(line.rstrip('\n') + '\n')


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
        set_step(status, steps, index, 'failed', f'Command exited with code {code}')
        raise RuntimeError(f"{steps[index]['label']} failed with exit code {code}")
    set_step(status, steps, index, 'done')


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
            {'key': 'apt-upgrade', 'label': 'Install Debian updates', 'status': 'pending'},
        ]
    elif update_type == 'portal':
        steps = [
            {'key': 'git-pull', 'label': 'Pull portal source', 'status': 'pending'},
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
        **({'targetTimezone': target_timezone} if target_timezone else {})
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
            run_command(status, steps, 0, ['git', 'pull', '--ff-only'], cwd=PROJECT_DIR)
            run_command(status, steps, 1, ['docker', 'compose', 'up', '--build', '-d'], cwd=PROJECT_DIR)
            run_command(status, steps, 2, ['docker', 'image', 'prune', '-f'], cwd=PROJECT_DIR)
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
