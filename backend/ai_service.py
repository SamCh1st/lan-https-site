"""Recover a stopped local Ollama service without retrying submitted generations.

See [README: chat response flow](../README.md#chat-response-flow)."""
import errno
import os
from pathlib import Path
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request


class Unavailable(OSError):
    pass


_start_lock = threading.Lock()
_process = None
_last_start = float('-inf')


def is_default_local(base):
    try:
        url = urllib.parse.urlsplit(base)
        return (url.scheme == 'http' and url.hostname in ('127.0.0.1', 'localhost')
                and url.port == 11434 and not url.username and not url.password
                and url.path in ('', '/') and not url.query and not url.fragment)
    except ValueError:
        return False


def connection_refused(error):
    reason = getattr(error, 'reason', error)
    return (isinstance(reason, ConnectionRefusedError)
            or getattr(reason, 'errno', None) in (errno.ECONNREFUSED, 10061)
            or getattr(reason, 'winerror', None) == 10061)


def ready(base):
    try:
        with urllib.request.urlopen(base.rstrip('/') + '/api/tags', timeout=.5) as response:
            return response.status == 200
    except (OSError, urllib.error.URLError):
        return False


def start_local(base):
    """Only start an already-installed Windows service at the default local endpoint.

    See [README: chat response flow](../README.md#chat-response-flow)."""
    global _process, _last_start
    if sys.platform != 'win32' or not is_default_local(base):
        return False
    with _start_lock:
        # Another request or the desktop app may already have started it.
        if ready(base):
            return True
        if time.monotonic() - _last_start < 15:
            return False
        installed = Path(os.environ.get('LOCALAPPDATA', '')) / 'Programs' / 'Ollama' / 'ollama.exe'
        executable = str(installed) if installed.is_file() else shutil.which('ollama.exe')
        if not executable:
            return False
        _last_start = time.monotonic()
        try:
            if _process is None or _process.poll() is not None:
                _process = subprocess.Popen([executable, 'serve'],
                    stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                    creationflags=subprocess.CREATE_NO_WINDOW,
                    env=dict(os.environ, OLLAMA_HOST=base))
            deadline = time.monotonic() + 10
            while time.monotonic() < deadline:
                if ready(base):
                    return True
                if _process.poll() is not None:
                    return False
                time.sleep(.25)
        except OSError:
            return False
    return False


def open_response(request, base, timeout):
    """Open a model-service response, recovering eligible refused local connections without retrying read timeouts.

    See [README: chat response flow](../README.md#chat-response-flow)."""
    try:
        return urllib.request.urlopen(request, timeout=timeout)
    except urllib.error.HTTPError:
        raise  # A model/server error is not a stopped service.
    except (OSError, urllib.error.URLError) as error:
        # A refused connection has not submitted a generation. Never replay a
        # request after a read timeout or a disconnect during model output.
        if connection_refused(error) and start_local(base):
            try:
                return urllib.request.urlopen(request, timeout=timeout)
            except urllib.error.HTTPError:
                raise
            except (OSError, urllib.error.URLError) as retry_error:
                error = retry_error
        reason = getattr(error, 'reason', error)
        if isinstance(reason, TimeoutError):
            message = 'The AI service took too long to respond. Wait a moment, then try again.'
        elif is_default_local(base):
            message = ('The local AI service (Ollama) is unavailable. '
                       'Open Ollama on the hosting computer, then try again.')
        else:
            message = ('The configured AI service is unreachable. '
                       'Check that Ollama is running at the configured address, then try again.')
        raise Unavailable(message) from error
