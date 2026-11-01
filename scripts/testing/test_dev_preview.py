from pathlib import Path
import socket
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import dev_preview


class PreviewTest(unittest.TestCase):
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
