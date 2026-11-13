<?php

namespace App\Http\Controllers;

use App\Models\ReportingLine;
use App\Services\OrganizationChartService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class OrganizationChartController extends Controller
{
    public function __construct(private OrganizationChartService $chartService)
    {
    }

    public function index(Request $request)
    {
        $data = $request->validate(['location_id' => ['nullable', 'string', 'max:255']]);
        return response()->json($this->chartService->chart(Auth::user(), $data['location_id'] ?? null));
    }

    public function storeRelation(Request $request)
    {
        $data = $request->validate([
            'location_id' => ['required', 'string', 'max:255'],
            'leader_id' => ['required', 'string', 'exists:users,username', 'different:subordinate_id'],
            'subordinate_id' => ['required', 'string', 'exists:users,username'],
        ]);
        $line = $this->chartService->createRelation(
            Auth::user(),
            $data['location_id'],
            $data['leader_id'],
            $data['subordinate_id']
        );

        return response()->json(['id' => $line->id, 'message' => 'Relasi berhasil disimpan.'], 201);
    }

    public function updateRelation(Request $request, ReportingLine $reportingLine)
    {
        $data = $request->validate([
            'location_id' => ['required', 'string', 'max:255'],
            'status' => ['required', 'in:active,inactive'],
        ]);
        $line = $this->chartService->updateRelationStatus(
            Auth::user(),
            $reportingLine,
            $data['location_id'],
            $data['status']
        );

        return response()->json(['id' => $line->id, 'status' => $line->status, 'message' => 'Status relasi berhasil diperbarui.']);
    }

    public function destroyRelation(Request $request, ReportingLine $reportingLine)
    {
        $data = $request->validate(['location_id' => ['required', 'string', 'max:255']]);
        $this->chartService->deleteRelation(Auth::user(), $reportingLine, $data['location_id']);

        return response()->json(['message' => 'Relasi berhasil dihapus.']);
    }

    public function updateLayout(Request $request)
    {
        $data = $request->validate([
            'location_id' => ['required', 'string', 'max:255'],
            'nodes' => ['present', 'array', 'max:1000'],
            'nodes.*' => ['required', 'array'],
            'nodes.*.x' => ['required', 'numeric', 'between:0,1'],
            'nodes.*.y' => ['required', 'numeric', 'between:0,1'],
            'edges' => ['present', 'array', 'max:2000'],
            'edges.*' => ['required', 'array'],
            'edges.*.points' => ['present', 'array', 'max:12'],
            'edges.*.points.*' => ['required', 'array'],
            'edges.*.points.*.x' => ['required', 'numeric', 'between:0,1'],
            'edges.*.points.*.y' => ['required', 'numeric', 'between:0,1'],
        ]);
        $layout = $this->chartService->saveLayout(
            Auth::user(),
            $data['location_id'],
            $data['nodes'],
            $data['edges']
        );

        return response()->json(['layout' => $layout, 'message' => 'Layout organigram berhasil disimpan.']);
    }

    public function storeNode(Request $request)
    {
        return $this->saveNode($request, (string) $request->input('username'));
    }

    public function updateNode(Request $request, string $username)
    {
        return $this->saveNode($request, $username);
    }

    public function destroyNode(Request $request, string $username)
    {
        $data = $request->validate(['location_id' => ['required', 'string', 'max:255']]);
        $this->chartService->deleteNode(Auth::user(), $data['location_id'], $username);

        return response()->json(['message' => 'Card dan seluruh relasi permanennya berhasil dihapus.']);
    }

    private function saveNode(Request $request, string $username)
    {
        $data = $request->validate([
            'location_id' => ['required', 'string', 'max:255'],
            'username' => ['sometimes', 'required', 'string', 'exists:users,username'],
            'job_level_id' => ['required', 'integer'],
            'leader_ids' => ['required', 'array', 'min:1'],
            'leader_ids.*' => ['required', 'string', 'distinct', 'exists:users,username'],
        ]);
        $this->chartService->saveNode(
            Auth::user(),
            $data['location_id'],
            $username,
            (int) $data['job_level_id'],
            $data['leader_ids']
        );

        return response()->json(['message' => 'Card organigram berhasil disimpan.']);
    }
}
