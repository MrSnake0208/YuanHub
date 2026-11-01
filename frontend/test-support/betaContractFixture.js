// These tests exercise endpoint serialization, not authorization. Production gates are never optional.
import { beforeEach, afterEach, mock } from 'node:test'
import { beta } from '../src/store/beta.js'
export function installBetaAccessFixture() {
  beforeEach(() => { mock.method(beta, 'requireAccess', async () => {}) })
  afterEach(() => { mock.restoreAll() })
}
