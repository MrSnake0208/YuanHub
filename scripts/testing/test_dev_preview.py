from pathlib import Path
import socket
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import dev_preview


class PreviewTest(unittest.TestCase):
    def test_foreground_and_persistent_tailscale_ports_are_both_reserved(self):
        config = {'TCP': {'443': {'HTTPS': True}}, 'Foreground': {
            'session': {'TCP': {'54229': {'TCPForward': '127.0.0.1:54229'}}},
        }}
        self.assertEqual({'HTTPS': True}, dev_preview.forwards(config)['443'])
        self.assertEqual('127.0.0.1:54229', dev_preview.forwards(config)['54229']['TCPForward'])
        self.assertNotIn('54229', config['TCP'])

    def test_occupied_port_fails_without_disrupting_listener(self):
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            listener.listen()
            port = listener.getsockname()[1]
            with self.assertRaisesRegex(RuntimeError, '已占用'):
                dev_preview.check_ports([port])
            with socket.create_connection(('127.0.0.1', port), timeout=1):
                pass


if __name__ == '__main__':
    unittest.main()
