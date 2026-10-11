import { request } from './request.js'
import { auth } from '../store/auth.js'

const ADMIN = '/v1/admin/ledger'
const options = () => ({ auth: true, expectedUserId: String(auth.userInfo?.id || '') })
export const getLedgerCatalog = () => request('/hub/ledger/catalog')
export const getAdminLedgerCatalog = () => request(ADMIN, options())
export const saveLedgerPackage = (id, body) => request(ADMIN + '/packages' + (id ? '/' + encodeURIComponent(id) : ''), { ...options(), method: id ? 'PUT' : 'POST', body })
export const previewLedgerCampaign = body => request(ADMIN + '/campaigns/preview', { ...options(), method: 'POST', body })
export const saveLedgerCampaign = (id, body) => request(ADMIN + '/campaigns' + (id ? '/' + encodeURIComponent(id) : ''), { ...options(), method: id ? 'PUT' : 'POST', body })
export const saveLedgerSettings = body => request(ADMIN + '/settings', { ...options(), method: 'PUT', body })
