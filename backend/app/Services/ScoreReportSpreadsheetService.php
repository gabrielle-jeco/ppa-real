<?php

namespace App\Services;

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class ScoreReportSpreadsheetService
{
    public function write(string $mode, array $filters, CmsScoreReportService $reportService, string $target): void
    {
        $rows = $reportService->exportRows($mode, $filters);
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle($mode === 'monthly' ? 'Penilaian Bulanan' : 'Penilaian Harian');

        $headers = $mode === 'monthly'
            ? ['Tanggal', 'Cabang', 'NIK & Nama Subordinate', 'NIK & Nama Atasan', 'Nilai Tugas', 'Nilai Absensi', 'Nilai Evaluasi', 'Persentase']
            : ['Tanggal', 'Cabang', 'NIK & Nama Subordinate', 'NIK & Nama Atasan', 'Total Tugas Approve', 'Total Tugas Not Approve', 'Persentase'];
        $sheet->fromArray($headers, null, 'A1');

        $rowNumber = 2;
        foreach ($rows as $reportRow) {
            $subordinate = $reportRow['subordinate_id'] . ' - ' . $reportRow['subordinate_name'];
            $leader = $reportRow['leader_id']
                ? $reportRow['leader_id'] . ' - ' . $reportRow['leader_name']
                : $reportRow['leader_name'];
            $row = $mode === 'monthly'
                ? [
                    $reportRow['date'],
                    $reportRow['branch'],
                    $subordinate,
                    $leader,
                    $reportRow['task_score'],
                    $reportRow['attendance_score'],
                    $reportRow['evaluation_score'],
                    $reportRow['percentage'],
                ]
                : [
                    $reportRow['date'],
                    $reportRow['branch'],
                    $subordinate,
                    $leader,
                    $reportRow['approved_tasks'],
                    $reportRow['unapproved_tasks'],
                    $reportRow['percentage'],
                ];
            $sheet->fromArray($row, null, 'A' . $rowNumber++);
        }

        $lastColumn = $mode === 'monthly' ? 'H' : 'G';
        $sheet->getStyle("A1:{$lastColumn}1")->applyFromArray([
            'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '7042C1']],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
        ]);
        $sheet->freezePane('A2');
        foreach (range('A', $lastColumn) as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }

        (new Xlsx($spreadsheet))->save($target);
        $spreadsheet->disconnectWorksheets();
    }
}
