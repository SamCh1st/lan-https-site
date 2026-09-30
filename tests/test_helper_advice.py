import _bootstrap  # Shared backend import path for tests and previews.
import sys
import threading
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from helper_advice import HelperAdvice, scope_key


class HelperAdviceTests(unittest.TestCase):
    def test_slow_helper_never_blocks_reads_or_queues_another_job(self):
        cache = HelperAdvice()
        entered, release = threading.Event(), threading.Event()
        threads = []
        real_thread = threading.Thread

        def make_thread(**kwargs):
            thread = real_thread(**kwargs)
            threads.append(thread)
            return thread

        def request(*args, **kwargs):
            entered.set()
            release.wait(2)
            return {"message": {"content": '{"advice":"The door is locked."}'}}

        try:
            with patch('helper_advice.threading.Thread', side_effect=make_thread):
                cache.prepare('a', ['small'], {}, [], 'reply', request)
                self.assertTrue(entered.wait(1))
                self.assertEqual(cache.ready('a'), [])
                cache.prepare('b', ['other'], {}, [], 'reply', request)
                self.assertEqual(len(threads), 1)
        finally:
            release.set()
            for thread in threads:
                thread.join(2)
        self.assertEqual(cache.ready('a'), [('small', 'The door is locked.')])
        self.assertEqual(cache.ready('b'), [])

    def test_failures_release_worker_and_helpers_rotate(self):
        cache = HelperAdvice()
        jobs = []
        models = []
        def failed_request(path, payload, **kwargs):
            models.append(payload['model'])
            raise OSError('Ollama unavailable')
        with patch('helper_advice.threading.Thread') as thread:
            thread.side_effect = lambda **kw: jobs.append(kw['target']) or unittest.mock.Mock()
            for _ in range(2):
                cache.prepare('key', ['first', 'second'], {}, [], 'reply', failed_request)
                jobs.pop()()
                self.assertFalse(cache.busy)
        self.assertEqual(cache.rotation, 2)
        self.assertEqual(models, ['first', 'second'])
        self.assertEqual(cache.ready('key'), [])

    def test_expiry_and_storage_bound(self):
        cache = HelperAdvice()
        with patch('helper_advice.threading.Thread') as thread:
            def start_inline(**kw):
                result = unittest.mock.Mock()
                result.start.side_effect = kw['target']
                return result
            thread.side_effect = start_inline
            with patch('helper_advice.time.monotonic', return_value=100):
                for i in range(70):
                    cache.prepare(str(i), ['m'], {}, [], '', lambda *a, **k: {
                        'message': {'content': '{"advice":"note"}'}})
                self.assertEqual(len(cache.cache), 64)
                self.assertEqual(cache.ready('0'), [])
                self.assertTrue(cache.ready('69'))
            with patch('helper_advice.time.monotonic', return_value=401):
                self.assertEqual(cache.ready('69'), [])

    def test_scope_isolation_and_context_changes(self):
        scope = [1, 2, None, 'character', 3, [1]]
        context = {'story': 'old', 'memory': 'old', 'known_cards': ['public']}
        key = scope_key(scope, context, ['lead', 'helper'])
        self.assertEqual(key, scope_key(scope, dict(context, memory='new', story='new'), ['lead', 'helper']))
        for index, value in enumerate([2, 3, 4, 'dm', 5, [2]]):
            changed = scope.copy()
            changed[index] = value
            self.assertNotEqual(key, scope_key(changed, context, ['lead', 'helper']))
        self.assertNotEqual(key, scope_key(scope, dict(context, known_cards=['private']), ['lead', 'helper']))
        self.assertNotEqual(key, scope_key(scope, context, ['lead', 'different']))


if __name__ == '__main__':
    unittest.main()
