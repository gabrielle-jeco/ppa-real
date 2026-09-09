<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Carbon\Carbon;
use Tests\TestCase;

class ServerTimeTest extends TestCase
{
    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_guest_cannot_access_server_time(): void
    {
        $this->getJson('/api/cms/server-time')->assertUnauthorized();
    }

    public function test_admin_receives_uncached_laravel_time(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-09-09 13:00:00', 'Asia/Jakarta'));
        $user = new User(['username' => 'test-admin']);
        $user->setRelation('accountRole', new Role(['name' => 'admin', 'permissions' => []]));

        $response = $this->actingAs($user, 'sanctum')->getJson('/api/cms/server-time');

        $response->assertOk()->assertExactJson([
            'server_time' => '2026-09-09T06:00:00.000000Z',
            'timezone' => 'Asia/Jakarta',
        ]);
        $this->assertTrue($response->headers->hasCacheControlDirective('no-store'));
    }

    public function test_monitoring_only_admin_can_access_server_time(): void
    {
        $user = new User(['username' => 'test-monitor']);
        $user->setRelation('accountRole', new Role([
            'name' => 'monitoring',
            'permissions' => ['user_activity'],
        ]));

        $this->actingAs($user, 'sanctum')->getJson('/api/cms/server-time')
            ->assertOk()->assertJsonStructure(['server_time', 'timezone']);
    }

    public function test_operational_user_cannot_access_server_time(): void
    {
        $user = $this->getMockBuilder(User::class)->onlyMethods(['getRoleTypeAttribute'])->getMock();
        $user->method('getRoleTypeAttribute')->willReturn('employee');

        $this->actingAs($user, 'sanctum')->getJson('/api/cms/server-time')->assertForbidden();
    }
}
