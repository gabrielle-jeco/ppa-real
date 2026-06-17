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

    // Manager Routes
    Route::get('/manager/supervisors', [App\Http\Controllers\ManagerController::class, 'getSupervisors']);
    Route::get('/manager/supervisors/{id}/stats', [App\Http\Controllers\ManagerController::class, 'getSupervisorStats']);
    Route::get('/manager/supervisors/{id}/crews', [App\Http\Controllers\ManagerController::class, 'getSupervisorCrewTasks']);

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
    Route::get('/evaluation-master/active', [App\Http\Controllers\AdminController::class, 'activeEvaluationMaster']);

    // CMS / Superadmin Routes
    Route::prefix('cms')->group(function () {
        Route::get('/overview', [App\Http\Controllers\AdminController::class, 'overview']);
        Route::post('/users', [App\Http\Controllers\AdminController::class, 'storeUser']);
        Route::patch('/users/{username}', [App\Http\Controllers\AdminController::class, 'updateUser']);
        Route::get('/locations', [App\Http\Controllers\AdminController::class, 'getLocations']);
        Route::post('/locations', [App\Http\Controllers\AdminController::class, 'storeLocation']);
        Route::patch('/locations/{initial}', [App\Http\Controllers\AdminController::class, 'updateLocation']);
        Route::delete('/locations/{initial}', [App\Http\Controllers\AdminController::class, 'destroyLocation']);
        Route::post('/user-locations/sync', [App\Http\Controllers\AdminController::class, 'syncUserLocationsFromUsers']);
        Route::post('/user-locations', [App\Http\Controllers\AdminController::class, 'storeUserLocation']);
        Route::patch('/user-locations/{userLocation}', [App\Http\Controllers\AdminController::class, 'updateUserLocation']);
        Route::post('/evaluation-masters', [App\Http\Controllers\AdminController::class, 'storeEvaluationMaster']);
        Route::patch('/evaluation-masters/{evaluationMaster}', [App\Http\Controllers\AdminController::class, 'updateEvaluationMaster']);
        Route::delete('/evaluation-masters/{evaluationMaster}', [App\Http\Controllers\AdminController::class, 'destroyEvaluationMaster']);
        Route::post('/roles', [App\Http\Controllers\AdminController::class, 'storeRole']);
        Route::patch('/roles/{role}', [App\Http\Controllers\AdminController::class, 'updateRole']);
        Route::delete('/roles/{role}', [App\Http\Controllers\AdminController::class, 'destroyRole']);
        Route::post('/app-roles', [App\Http\Controllers\AdminController::class, 'storeAppRole']);
        Route::patch('/app-roles/{appRole}', [App\Http\Controllers\AdminController::class, 'updateAppRole']);
        Route::delete('/app-roles/{appRole}', [App\Http\Controllers\AdminController::class, 'destroyAppRole']);
        Route::get('/regionals', [App\Http\Controllers\AdminController::class, 'getRegionals']);
        Route::post('/regionals', [App\Http\Controllers\AdminController::class, 'storeRegional']);
        Route::patch('/regionals/{regional}', [App\Http\Controllers\AdminController::class, 'updateRegional']);
        Route::delete('/regionals/{regional}', [App\Http\Controllers\AdminController::class, 'destroyRegional']);
        Route::get('/users', [App\Http\Controllers\AdminController::class, 'getUsers']);
        Route::get('/user-locations', [App\Http\Controllers\AdminController::class, 'getUserLocations']);
        Route::get('/leaders', [App\Http\Controllers\AdminController::class, 'getLeaders']);
        Route::get('/reporting-lines', [App\Http\Controllers\AdminController::class, 'getReportingLines']);

        Route::post('/reporting-lines', [App\Http\Controllers\AdminController::class, 'storeReportingLine']);
        Route::patch('/reporting-lines/{reportingLine}', [App\Http\Controllers\AdminController::class, 'updateReportingLine']);
        Route::delete('/reporting-lines/{reportingLine}', [App\Http\Controllers\AdminController::class, 'destroyReportingLine']);
        Route::post('/work-stations', [App\Http\Controllers\AdminController::class, 'storeWorkStation']);
        Route::patch('/work-stations/{workStation}', [App\Http\Controllers\AdminController::class, 'updateWorkStation']);
        Route::delete('/work-stations/{workStation}', [App\Http\Controllers\AdminController::class, 'destroyWorkStation']);
    });
});

// Supervisor Routes
Route::middleware(['auth:sanctum'])->prefix('supervisor')->group(function () {
    Route::get('/crews', [App\Http\Controllers\SupervisorController::class, 'index']);
    Route::get('/stats', [App\Http\Controllers\SupervisorController::class, 'myStats']);
    Route::get('/crew/{id}/eval-stats', [App\Http\Controllers\SupervisorController::class, 'getCrewEvalStats']);
});

