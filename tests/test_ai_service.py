import _bootstrap
import errno
import unittest
import urllib.error
import urllib.request
from unittest.mock import Mock, patch

import ai_service
import server


BASE = 'http://127.0.0.1:11434'


def refused():
    return urllib.error.URLError(ConnectionRefusedError(errno.ECONNREFUSED, 'refused'))


class AIServiceTests(unittest.TestCase):
    def setUp(self):
        self.request = urllib.request.Request(BASE + '/api/chat', data=b'{}')

    def test_healthy_service_needs_no_startup(self):
        with patch.object(ai_service.urllib.request, 'urlopen', return_value='response') as open_url, \
                patch.object(ai_service, 'start_local') as start:
            self.assertEqual(ai_service.open_response(self.request, BASE, 120), 'response')
            open_url.assert_called_once_with(self.request, timeout=120)
            start.assert_not_called()

    def test_refused_connection_starts_service_then_retries_once(self):
        with patch.object(ai_service.urllib.request, 'urlopen', side_effect=[refused(), 'response']) as open_url, \
                patch.object(ai_service, 'start_local', return_value=True) as start:
            self.assertEqual(ai_service.open_response(self.request, BASE, 120), 'response')
            start.assert_called_once_with(BASE)
            self.assertEqual(open_url.call_count, 2)

    def test_failed_start_has_actionable_message_not_windows_trace(self):
        with patch.object(ai_service.urllib.request, 'urlopen', side_effect=refused()) as open_url, \
                patch.object(ai_service, 'start_local', return_value=False):
            with self.assertRaisesRegex(ai_service.Unavailable, 'Open Ollama on the hosting computer'):
                ai_service.open_response(self.request, BASE, 120)
            self.assertEqual(open_url.call_count, 1)

    def test_timeout_never_replays_a_possibly_submitted_generation(self):
        for error in (TimeoutError(), urllib.error.URLError(TimeoutError())):
            with self.subTest(error=error), \
                    patch.object(ai_service.urllib.request, 'urlopen', side_effect=error) as open_url, \
                    patch.object(ai_service, 'start_local') as start:
                with self.assertRaisesRegex(ai_service.Unavailable, 'took too long'):
                    ai_service.open_response(self.request, BASE, 120)
                self.assertEqual(open_url.call_count, 1)
                start.assert_not_called()

    def test_http_error_is_not_misreported_as_stopped_service(self):
        error = urllib.error.HTTPError(BASE, 404, 'model not found', {}, None)
        with patch.object(ai_service.urllib.request, 'urlopen', side_effect=error), \
                patch.object(ai_service, 'start_local') as start:
            with self.assertRaises(urllib.error.HTTPError):
                ai_service.open_response(self.request, BASE, 120)
            start.assert_not_called()

    def test_remote_custom_and_non_windows_services_are_never_launched(self):
        with patch.object(ai_service.subprocess, 'Popen') as launch:
            for base in ('http://192.168.1.20:11434', 'http://localhost:12000',
                         'https://localhost:11434', BASE + '/proxy', 'http://user@localhost:11434'):
                self.assertFalse(ai_service.start_local(base))
            with patch.object(ai_service.sys, 'platform', 'linux'):
                self.assertFalse(ai_service.start_local(BASE))
            launch.assert_not_called()

    def test_windows_start_is_hidden_and_existing_process_is_reused(self):
        process = Mock()
        process.poll.return_value = None
        with patch.object(ai_service.sys, 'platform', 'win32'), \
                patch.object(ai_service, '_process', None), \
                patch.object(ai_service, '_last_start', float('-inf')), \
                patch.object(ai_service.Path, 'is_file', return_value=False), \
                patch.object(ai_service.shutil, 'which', return_value='C:/Ollama/ollama.exe'), \
                patch.object(ai_service.subprocess, 'CREATE_NO_WINDOW', 0x08000000, create=True), \
                patch.object(ai_service.subprocess, 'Popen', return_value=process) as launch, \
                patch.object(ai_service, 'ready', side_effect=[False, True, True]):
            self.assertTrue(ai_service.start_local(BASE))
            self.assertTrue(ai_service.start_local(BASE))
            launch.assert_called_once()
            self.assertEqual(launch.call_args.args[0], ['C:/Ollama/ollama.exe', 'serve'])
            self.assertEqual(launch.call_args.kwargs['creationflags'], 0x08000000)
            self.assertEqual(launch.call_args.kwargs['env']['OLLAMA_HOST'], BASE)

    def test_both_normal_and_streamed_calls_use_recovery(self):
        response = Mock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=False)
        response.read.return_value = b'{"models":[]}'
        response.__iter__ = Mock(return_value=iter([b'{"message":{"content":"Hello"}}']))
        with patch.object(ai_service, 'open_response', return_value=response) as open_response:
            self.assertEqual(server.ollama_request('/api/tags'), {'models': []})
            self.assertEqual(list(server.ollama_stream('/api/chat', {}))[0]['message']['content'], 'Hello')
            self.assertEqual(open_response.call_count, 2)


if __name__ == '__main__':
    unittest.main()
