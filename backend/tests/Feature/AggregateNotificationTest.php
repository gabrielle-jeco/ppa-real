<?php

namespace Tests\Feature;

use App\Models\UserNotification;
use App\Models\User;
use App\Services\UserNotificationService;
use App\Services\WebPushService;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Mockery;
use Tests\TestCase;

class AggregateNotificationTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();

        config([
            'database.default' => 'sqlite',
            'database.connections.sqlite.database' => ':memory:',
        ]);
        DB::purge('sqlite');
        DB::reconnect('sqlite');

        Schema::create('user_notifications', function (Blueprint $table) {
            $table->id();
            $table->string('recipient_id');
            $table->string('dedupe_key')->nullable();
            $table->string('type');
            $table->string('title');
            $table->text('message');
            $table->text('description')->nullable();
            $table->json('data')->nullable();
            $table->timestamp('read_at')->nullable();
            $table->timestamps();
            $table->unique(['recipient_id', 'dedupe_key']);
        });
    }

    protected function tearDown(): void
    {
        DB::disconnect('sqlite');
        parent::tearDown();
    }

    public function test_unread_aggregate_is_updated_without_adding_a_row_or_repeating_push(): void
    {
        $push = Mockery::mock(WebPushService::class);
        $push->shouldReceive('sendToUsers')->once();
        $this->app->instance(WebPushService::class, $push);
        $service = new UserNotificationService();

        $service->createOrRefreshAggregateAndPush(
            'supervisor-1',
            'approval-needed-supervisor-1',
            'approval_needed',
            'Persetujuan',
            'Anda memiliki 1 pekerjaan yang membutuhkan persetujuan saat ini.',
            null,
            ['pending_count' => 1, 'tag' => 'approval-needed-supervisor-1']
        );
        $service->createOrRefreshAggregateAndPush(
            'supervisor-1',
            'approval-needed-supervisor-1',
            'approval_needed',
            'Persetujuan',
            'Anda memiliki 12 pekerjaan yang membutuhkan persetujuan saat ini.',
            null,
            ['pending_count' => 12, 'tag' => 'approval-needed-supervisor-1']
        );

        $this->assertSame(1, UserNotification::count());
        $this->assertSame(
            12,
            UserNotification::first()->data['pending_count']
        );
    }

    public function test_new_activity_reopens_a_read_aggregate_and_sends_push_again(): void
    {
        $push = Mockery::mock(WebPushService::class);
        $push->shouldReceive('sendToUsers')->twice();
        $this->app->instance(WebPushService::class, $push);
        $service = new UserNotificationService();

        $notification = $service->createOrRefreshAggregateAndPush(
            'supervisor-1',
            'approval-needed-supervisor-1',
            'approval_needed',
            'Persetujuan',
            'Anda memiliki 1 pekerjaan yang membutuhkan persetujuan saat ini.'
        );
        $notification->update(['read_at' => now()]);

        $refreshed = $service->createOrRefreshAggregateAndPush(
            'supervisor-1',
            'approval-needed-supervisor-1',
            'approval_needed',
            'Persetujuan',
            'Anda memiliki 2 pekerjaan yang membutuhkan persetujuan saat ini.'
        );

        $this->assertNull($refreshed->fresh()->read_at);
        $this->assertSame(1, UserNotification::count());
    }

    public function test_refresh_marks_finished_aggregate_as_read_without_push(): void
    {
        $push = Mockery::mock(WebPushService::class);
        $push->shouldReceive('sendToUsers')->once();
        $this->app->instance(WebPushService::class, $push);
        $service = new UserNotificationService();

        $service->createOrRefreshAggregateAndPush(
            'supervisor-1',
            'approval-needed-supervisor-1',
            'approval_needed',
            'Persetujuan',
            'Anda memiliki 1 pekerjaan yang membutuhkan persetujuan saat ini.'
        );
        $service->refreshAggregate(
            'supervisor-1',
            'approval-needed-supervisor-1',
            'Anda memiliki 0 pekerjaan yang membutuhkan persetujuan saat ini.',
            ['pending_count' => 0],
            true
        );

        $notification = UserNotification::first();
        $this->assertNotNull($notification->read_at);
        $this->assertSame(0, $notification->data['pending_count']);
    }

    public function test_notification_endpoint_hides_legacy_approval_duplicates(): void
    {
        UserNotification::create([
            'recipient_id' => 'supervisor-1',
            'type' => 'approval_needed',
            'title' => 'Persetujuan',
            'message' => 'Notifikasi approval lama.',
        ]);
        $latestApproval = UserNotification::create([
            'recipient_id' => 'supervisor-1',
            'dedupe_key' => 'approval-needed-supervisor-1',
            'type' => 'approval_needed',
            'title' => 'Persetujuan',
            'message' => 'Notifikasi approval terbaru.',
        ]);
        $taskNotification = UserNotification::create([
            'recipient_id' => 'supervisor-1',
            'type' => 'task_updated',
            'title' => 'Tugas',
            'message' => 'Tugas diperbarui.',
        ]);

        $user = new User(['username' => 'supervisor-1']);
        $response = $this->actingAs($user, 'sanctum')->getJson('/api/notifications');

        $response->assertOk()
            ->assertJsonPath('unread_count', 2)
            ->assertJsonCount(2, 'notifications');
        $this->assertSame(
            [$taskNotification->id, $latestApproval->id],
            collect($response->json('notifications'))->pluck('id')->all()
        );
    }
}
