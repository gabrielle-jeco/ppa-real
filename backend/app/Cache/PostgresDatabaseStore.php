<?php

namespace App\Cache;

use Illuminate\Cache\DatabaseStore;

class PostgresDatabaseStore extends DatabaseStore
{
    public function put($key, $value, $seconds)
    {
        return $this->table()->upsert([
            'key' => $this->prefix.$key,
            'value' => $this->serialize($value),
            'expiration' => $this->getTime() + $seconds,
        ], ['key'], ['value', 'expiration']) > 0;
    }

    public function add($key, $value, $seconds)
    {
        $key = $this->prefix.$key;
        $value = $this->serialize($value);
        $now = $this->getTime();
        $expiration = $now + $seconds;

        if ($this->table()->insertOrIgnore(compact('key', 'value', 'expiration')) > 0) {
            return true;
        }

        return $this->table()->where('key', $key)->where('expiration', '<=', $now)
            ->update(compact('value', 'expiration')) > 0;
    }
}
