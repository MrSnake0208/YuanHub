import { request } from './request.js'

const path = (account, game, operator) => '/v1/operator/' + encodeURIComponent(operator) + '/milestones?' + new URLSearchParams({ account_id: account, game })
export const getOperatorMilestones = (account, game, operator, user) => request(path(account, game, operator), { auth: true, expectedUserId: user })
export const putOperatorMilestones = (account, game, operator, user, body) => request(path(account, game, operator), { auth: true, expectedUserId: user, method: 'PUT', body })
