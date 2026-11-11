-- Check all dimensions before charging any, and expire the counters atomically.
local retry = 0
for i, key in ipairs(KEYS) do
    local offset = (i - 1) * 3
    local used = tonumber(redis.call('GET', key) or '0')
    if used + tonumber(ARGV[offset + 2]) > tonumber(ARGV[offset + 1]) then
        retry = math.max(retry, redis.call('TTL', key), 1)
    end
end
if retry > 0 then return retry end
for i, key in ipairs(KEYS) do
    local offset = (i - 1) * 3
    redis.call('INCRBY', key, ARGV[offset + 2])
    if redis.call('TTL', key) < 0 then redis.call('EXPIRE', key, ARGV[offset + 3]) end
end
return 0
