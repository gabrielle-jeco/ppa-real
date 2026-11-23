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
        $data = $request->validate([
            'location_id' => ['nullable', 'string', 'max:255'],
            'supervisor_id' => ['nullable', 'string', 'max:255'],
            'view' => ['nullable', 'in:all,supervisor'],
        ]);
        return response()->json($this->chartService->chart(
            Auth::user(),
            $data['location_id'] ?? null,
            $data['supervisor_id'] ?? null,
            ($data['view'] ?? 'all') === 'supervisor'
        ));
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

    public function updateRelation(Request $request, string $reportingLine)
    {
        $data = $request->validate([
            'location_id' => ['required', 'string', 'max:255'],
            'status' => ['required', 'in:active,inactive'],
        ]);
        abort_unless(ctype_digit($reportingLine), 404);
        $record = ReportingLine::withoutGlobalScope('effective_backup_period')->findOrFail($reportingLine);
        $line = $this->chartService->updateRelationStatus(
            Auth::user(),
            $record,
            $data['location_id'],
            $data['status']
        );

        return response()->json(['id' => $line->id, 'status' => $line->status, 'message' => 'Status relasi berhasil diperbarui.']);
    }

    public function updateGroup(Request $request, string $supervisor)
    {
        $data = $request->validate(['location_id' => ['required', 'string'], 'status' => ['required', 'in:active,inactive']]);
        $this->chartService->updateGroupStatus(Auth::user(), $data['location_id'], $supervisor, $data['status']);
        return response()->json(['message' => 'Status kelompok berhasil diperbarui.']);
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
            'supervisor_id' => ['nullable', 'string', 'max:255'],
            'canvas' => ['sometimes', 'array:width,height', 'required_array_keys:width,height'],
            'canvas.width' => ['required_with:canvas', 'integer', 'between:900,1000000'],
            'canvas.height' => ['required_with:canvas', 'integer', 'between:760,1000000'],
            'nodes' => ['present', 'array', 'max:5000'],
            'nodes.*' => ['required', 'array'],
            'nodes.*.x' => ['required', 'numeric', 'between:0,1'],
            'nodes.*.y' => ['required', 'numeric', 'between:0,1'],
            'edges' => ['present', 'array', 'max:2000'],
            'edges.*' => ['required', 'array'],
            'edges.*.points' => ['present', 'array', 'max:1000'],
            'edges.*.points.*' => ['required', 'array'],
            'edges.*.points.*.x' => ['required', 'numeric', 'between:0,1'],
            'edges.*.points.*.y' => ['required', 'numeric', 'between:0,1'],
            'edges.*.start_anchor' => ['sometimes', 'array:side,position', 'required_array_keys:side,position'],
            'edges.*.start_anchor.side' => ['required_with:edges.*.start_anchor', 'in:top,right,bottom,left'],
            'edges.*.start_anchor.position' => ['required_with:edges.*.start_anchor', 'numeric', 'between:0,1'],
            'edges.*.end_anchor' => ['sometimes', 'array:side,position', 'required_array_keys:side,position'],
            'edges.*.end_anchor.side' => ['required_with:edges.*.end_anchor', 'in:top,right,bottom,left'],
            'edges.*.end_anchor.position' => ['required_with:edges.*.end_anchor', 'numeric', 'between:0,1'],
        ]);
        $layout = $this->chartService->saveLayout(
            Auth::user(),
            $data['location_id'],
            $data['nodes'],
            $data['edges'],
            $data['supervisor_id'] ?? null,
            $data['canvas'] ?? null
        );

        return response()->json(['layout' => $layout, 'message' => 'Layout organigram berhasil disimpan.']);
    }

    public function placeNode(Request $request, string $username)
    {
        $data = $request->validate([
            'location_id' => ['required', 'string', 'max:255'],
            'transitions' => ['required', 'array', 'min:1', 'max:100'],
            'transitions.*' => ['required', 'array:leader_id,status'],
            'transitions.*.leader_id' => ['required', 'string', 'distinct', 'exists:users,username'],
            'transitions.*.status' => ['required', 'in:active,inactive'],
        ]);
        return \Illuminate\Support\Facades\DB::transaction(function () use ($request, $data, $username) {
            $this->chartService->placeCrew(Auth::user(), $data['location_id'], $username, $data['transitions']);
            return $this->updateLayout($request);
        });
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
            'initial_status' => ['sometimes', 'in:active,inactive'],
            'leader_ids' => ['required', 'array', 'min:1'],
            'leader_ids.*' => ['required', 'string', 'distinct', 'exists:users,username'],
        ]);
        $this->chartService->saveNode(
            Auth::user(),
            $data['location_id'],
            $username,
            (int) $data['job_level_id'],
            $data['leader_ids'],
            $data['initial_status'] ?? 'active'
        );

        return response()->json(['message' => 'Card organigram berhasil disimpan.']);
    }
}
