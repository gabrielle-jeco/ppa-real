<?php

namespace App\Services;

use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class TaskUsageSpreadsheetService
{
    public function write(array $filters, TaskUsageReportService $reportService, string $target): void
    {
        $rows = $reportService->rows($filters);
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Penggunaan Master Task');
        $sheet->fromArray(['Cabang', 'Kategori', 'Area', 'Master Task', 'Jumlah Penggunaan', 'Terakhir Digunakan'], null, 'A1');

        $rowNumber = 2;
        foreach ($rows as $row) {
            $sheet->fromArray([
                $row['branch_code'] . ' - ' . $row['branch'],
                $row['category'],
                $row['area'],
                $row['task'],
                $row['usage_count'],
                $row['last_used'],
            ], null, 'A' . $rowNumber++);
        }

        $lastRow = max(1, $rowNumber - 1);
        $sheet->getStyle('A1:F1')->applyFromArray([
            'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '7042C1']],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
        ]);
        $sheet->freezePane('A2');
        $sheet->setAutoFilter("A1:F{$lastRow}");
        foreach (range('A', 'F') as $column) {
            $sheet->getColumnDimension($column)->setAutoSize(true);
        }

        (new Xlsx($spreadsheet))->save($target);
        $spreadsheet->disconnectWorksheets();
    }
}
