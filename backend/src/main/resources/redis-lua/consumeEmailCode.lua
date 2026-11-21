local entry = redis.call('GET', KEYS[1])
if not entry then return 0 end
local remaining, expected = string.match(entry, '^(%d+):(.+)$')
if expected == ARGV[1] then
    redis.call('DEL', KEYS[1])
    return 1
end
if not remaining or tonumber(remaining) <= 1 then
    redis.call('DEL', KEYS[1])
else
    redis.call('SET', KEYS[1], (tonumber(remaining) - 1) .. ':' .. expected, 'KEEPTTL')
end
return 0
