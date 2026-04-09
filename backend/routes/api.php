<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Here is where you can register API routes for your application. These
| routes are loaded by the RouteServiceProvider within a group which
| is assigned the "api" middleware group. Enjoy building your API!
|
*/

Route::post('/login', [App\Http\Controllers\AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/user', [App\Http\Controllers\AuthController::class, 'me']);
    Route::post('/logout', [App\Http\Controllers\AuthController::class, 'logout']);

    // Task Routes
    Route::get('/supervisor/{id}/tasks', [App\Http\Controllers\TaskController::class, 'index']);
    Route::get('/crews/{id}/tasks', [App\Http\Controllers\TaskController::class, 'index']);
    Route::post('/tasks', [App\Http\Controllers\TaskController::class, 'store']);
    Route::delete('/tasks/{id}', [App\Http\Controllers\TaskController::class, 'destroy']);
    Route::patch('/tasks/{id}/status', [App\Http\Controllers\TaskController::class, 'updateStatus']);
    Route::delete('/tasks/{id}/evidence', [App\Http\Controllers\TaskController::class, 'removeEvidence']);

    Route::post('/tasks/{id}/evidence', [App\Http\Controllers\TaskController::class, 'uploadEvidence']);

    // Evaluation Routes
    Route::post('/evaluations', [App\Http\Controllers\EvaluationController::class, 'store']);
    Route::get('/evaluations/check/{supervisorId}', [App\Http\Controllers\EvaluationController::class, 'checkPeriod']);

    // Crew Actions
    Route::post('/crew/activity', [App\Http\Controllers\ActivityController::class, 'logStationChange']);
    Route::get('/crew/activity-logs', [App\Http\Controllers\ActivityController::class, 'getLogs']);
    Route::post('/crew/read-guide', [App\Http\Controllers\TaskController::class, 'readGuide']);
    Route::get('/crew/check-guide', [App\Http\Controllers\TaskController::class, 'checkGuideStatus']);
    Route::get('/crew/stats', [App\Http\Controllers\CrewController::class, 'myStats']);
    Route::get('/work-stations', [App\Http\Controllers\ActivityController::class, 'getWorkStations']);
});

// Supervisor Routes
Route::middleware(['auth:sanctum'])->prefix('supervisor')->group(function () {
    Route::get('/crews', [App\Http\Controllers\SupervisorController::class, 'index']);
    Route::get('/stats', [App\Http\Controllers\SupervisorController::class, 'myStats']);
    Route::get('/crew/{id}/eval-stats', [App\Http\Controllers\SupervisorController::class, 'getCrewEvalStats']);
});

