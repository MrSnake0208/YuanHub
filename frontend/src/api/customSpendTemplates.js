import { request } from './request.js'

const path = '/v1/operator/custom-spend-templates'
const options = userId => ({ auth: true, expectedUserId: userId, headers: { 'Cache-Control': 'no-cache' } })
export const getCustomSpendTemplates = userId => request(path, options(userId))
export const putCustomSpendTemplates = (body, userId) => request(path, { ...options(userId), method: 'PUT', body })
