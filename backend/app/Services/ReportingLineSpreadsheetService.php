<?php

namespace App\Services;

use Illuminate\Http\UploadedFile;
use Illuminate\Validation\ValidationException;
use PhpOffice\PhpSpreadsheet\Cell\Coordinate;
use PhpOffice\PhpSpreadsheet\Cell\DataType;
use PhpOffice\PhpSpreadsheet\Reader\Xlsx;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Style\Alignment;
use PhpOffice\PhpSpreadsheet\Style\Fill;
use PhpOffice\PhpSpreadsheet\Style\NumberFormat;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx as XlsxWriter;
use ZipArchive;

class ReportingLineSpreadsheetService
{
    public const MAX_ROWS = 10000;
    public const MAX_LEADERS = 10;
    public const MAX_RELATIONS = 25000;
    public const MAX_FILE_KILOBYTES = 4096;

    private const MAX_ARCHIVE_ENTRIES = 1000;
    private const MAX_UNCOMPRESSED_BYTES = 32 * 1024 * 1024;

    public function writeTemplate(string $target): void
    {
        $spreadsheet = new Spreadsheet();
        $sheet = $spreadsheet->getActiveSheet();
        $sheet->setTitle('Reporting Lines');

        $headers = ['nik bawahan'];
        for ($index = 1; $index <= self::MAX_LEADERS; $index++) {
            $headers[] = "nik atasan {$index}";
        }

        foreach ($headers as $offset => $header) {
            $cell = Coordinate::stringFromColumnIndex($offset + 1) . '1';
            $sheet->setCellValueExplicit($cell, $header, DataType::TYPE_STRING);
        }

        $lastColumn = Coordinate::stringFromColumnIndex(count($headers));
        $sheet->getStyle("A1:{$lastColumn}1")->applyFromArray([
            'font' => ['bold' => true, 'color' => ['rgb' => 'FFFFFF']],
            'fill' => ['fillType' => Fill::FILL_SOLID, 'startColor' => ['rgb' => '6D42CE']],
            'alignment' => ['horizontal' => Alignment::HORIZONTAL_CENTER],
        ]);
        $sheet->getStyle("A:{$lastColumn}")->getNumberFormat()->setFormatCode(NumberFormat::FORMAT_TEXT);
        $sheet->freezePane('A2');
        $sheet->setAutoFilter("A1:{$lastColumn}1");
        $sheet->getColumnDimension('A')->setWidth(22);
        for ($column = 2; $column <= count($headers); $column++) {
            $sheet->getColumnDimension(Coordinate::stringFromColumnIndex($column))->setWidth(20);
        }

        (new XlsxWriter($spreadsheet))->save($target);
        $spreadsheet->disconnectWorksheets();
    }

    public function parse(UploadedFile $file): array
    {
        $this->assertSafeFile($file);

        $reader = new Xlsx();
        $reader->setReadDataOnly(true);
        $reader->setReadEmptyCells(false);

        try {
            $spreadsheet = $reader->load($file->getRealPath());
        } catch (\Throwable $error) {
            throw ValidationException::withMessages([
                'file' => ['Spreadsheet tidak dapat dibaca. Gunakan template XLSX dari YoDaily.'],
            ]);
        }

        try {
            $sheet = $spreadsheet->getSheet(0);
            $highestColumn = Coordinate::columnIndexFromString($sheet->getHighestDataColumn());
            $highestRow = $sheet->getHighestDataRow();

            if ($highestRow - 1 > self::MAX_ROWS) {
                throw ValidationException::withMessages([
                    'file' => ['Spreadsheet melebihi batas ' . number_format(self::MAX_ROWS) . ' baris data.'],
                ]);
            }

            $leaderColumns = $this->validateHeaders($sheet, $highestColumn);
            $relations = [];
            $errors = [];

            for ($row = 2; $row <= $highestRow; $row++) {
                $rawSubordinate = $sheet->getCell("A{$row}")->getValue();
                $rawLeaders = collect($leaderColumns)
                    ->mapWithKeys(fn(int $column) => [$column => $sheet->getCell(Coordinate::stringFromColumnIndex($column) . $row)->getValue()]);

                if ($this->isBlank($rawSubordinate) && $rawLeaders->every(fn($value) => $this->isBlank($value))) {
                    continue;
                }

                $subordinate = $this->normalizeNik($rawSubordinate);
                if (!$subordinate) {
                    $errors[] = $this->errorRow($row, $rawSubordinate, null, 'NIK bawahan kosong atau tidak valid.');
                    continue;
                }

                $hasLeader = false;
                foreach ($rawLeaders as $column => $rawLeader) {
                    if ($this->isBlank($rawLeader)) {
                        continue;
                    }

                    $hasLeader = true;
                    $leader = $this->normalizeNik($rawLeader);
                    if (!$leader) {
                        $errors[] = $this->errorRow(
                            $row,
                            $subordinate,
                            $rawLeader,
                            'NIK atasan pada kolom ' . Coordinate::stringFromColumnIndex($column) . ' tidak valid.'
                        );
                        continue;
                    }

                    $relations[] = [
                        'row' => $row - 1,
                        'subordinate_id' => $subordinate,
                        'leader_id' => $leader,
                    ];

                    if (count($relations) > self::MAX_RELATIONS) {
                        throw ValidationException::withMessages([
                            'file' => ['Spreadsheet melebihi batas ' . number_format(self::MAX_RELATIONS) . ' pasangan relasi.'],
                        ]);
                    }
                }

                if (!$hasLeader) {
                    $errors[] = $this->errorRow($row, $subordinate, null, 'Minimal satu NIK atasan harus diisi.');
                }
            }

            return ['relations' => $relations, 'errors' => $errors];
        } finally {
            $spreadsheet->disconnectWorksheets();
            unset($spreadsheet);
        }
    }

    private function assertSafeFile(UploadedFile $file): void
    {
        if (strtolower($file->getClientOriginalExtension()) !== 'xlsx') {
            throw ValidationException::withMessages(['file' => ['Hanya file berformat .xlsx yang diperbolehkan.']]);
        }

        if (($file->getSize() ?: 0) > self::MAX_FILE_KILOBYTES * 1024) {
            throw ValidationException::withMessages([
                'file' => ['Ukuran file maksimal ' . (self::MAX_FILE_KILOBYTES / 1024) . ' MB.'],
            ]);
        }

        $allowedMimes = [
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'application/zip',
            'application/x-zip-compressed',
            'application/octet-stream',
        ];
        if (!in_array((string) $file->getMimeType(), $allowedMimes, true)) {
            throw ValidationException::withMessages(['file' => ['Tipe file tidak dikenali sebagai spreadsheet XLSX.']]);
        }

        $zip = new ZipArchive();
        if ($zip->open($file->getRealPath()) !== true) {
            throw ValidationException::withMessages(['file' => ['Arsip XLSX rusak atau tidak dapat dibuka.']]);
        }

        try {
            if ($zip->numFiles > self::MAX_ARCHIVE_ENTRIES) {
                throw ValidationException::withMessages(['file' => ['Isi arsip XLSX terlalu kompleks.']]);
            }

            $uncompressedBytes = 0;
            for ($index = 0; $index < $zip->numFiles; $index++) {
                $stat = $zip->statIndex($index);
                $name = str_replace('\\', '/', (string) ($stat['name'] ?? ''));
                $uncompressedBytes += (int) ($stat['size'] ?? 0);

                if (!empty($stat['encryption_method'])) {
                    throw ValidationException::withMessages(['file' => ['Spreadsheet terenkripsi tidak diperbolehkan.']]);
                }

                if ($uncompressedBytes > self::MAX_UNCOMPRESSED_BYTES) {
                    throw ValidationException::withMessages(['file' => ['Isi XLSX melebihi batas aman setelah diekstrak.']]);
                }

                if (str_contains($name, '../') || str_starts_with($name, '/')) {
                    throw ValidationException::withMessages(['file' => ['Struktur arsip XLSX tidak aman.']]);
                }

                $lowerName = strtolower($name);
                if (str_contains($lowerName, 'vbaproject')
                    || str_contains($lowerName, '/externallinks/')
                    || str_contains($lowerName, '/embeddings/')
                    || str_contains($lowerName, '/oleobjects/')) {
                    throw ValidationException::withMessages(['file' => ['Macro, tautan eksternal, dan objek tertanam tidak diperbolehkan.']]);
                }

                if (preg_match('#^xl/worksheets/sheet\d+\.xml$#i', $name)) {
                    $xml = $zip->getFromIndex($index);
                    if ($xml !== false && preg_match('/<f(?:\s|>)/i', $xml)) {
                        throw ValidationException::withMessages(['file' => ['Formula tidak diperbolehkan dalam file import.']]);
                    }
                }

                if (str_ends_with($lowerName, '.rels')) {
                    $relationships = $zip->getFromIndex($index);
                    if ($relationships !== false && preg_match('/TargetMode\s*=\s*["\']External["\']/i', $relationships)) {
                        throw ValidationException::withMessages(['file' => ['Referensi eksternal tidak diperbolehkan dalam file import.']]);
                    }
                }
            }
        } finally {
            $zip->close();
        }
    }

    private function validateHeaders($sheet, int $highestColumn): array
    {
        if ($highestColumn < 2 || $highestColumn > self::MAX_LEADERS + 1) {
            throw ValidationException::withMessages([
                'file' => ['Gunakan satu kolom NIK bawahan dan maksimal ' . self::MAX_LEADERS . ' kolom NIK atasan.'],
            ]);
        }

        if ($this->normalizeHeader($sheet->getCell('A1')->getValue()) !== 'nik bawahan') {
            throw ValidationException::withMessages(['file' => ['Kolom pertama harus bernama "nik bawahan".']]);
        }

        $leaderColumns = [];
        $numbers = [];
        for ($column = 2; $column <= $highestColumn; $column++) {
            $header = $this->normalizeHeader($sheet->getCell(Coordinate::stringFromColumnIndex($column) . '1')->getValue());
            if ($header === '') {
                continue;
            }

            if (!preg_match('/^nik atasan ([1-9][0-9]*)$/', $header, $matches)) {
                throw ValidationException::withMessages([
                    'file' => ['Header kolom ' . Coordinate::stringFromColumnIndex($column) . ' harus mengikuti format "nik atasan 1".'],
                ]);
            }

            $number = (int) $matches[1];
            if ($number > self::MAX_LEADERS || in_array($number, $numbers, true)) {
                throw ValidationException::withMessages(['file' => ['Nomor kolom NIK atasan tidak valid atau berulang.']]);
            }

            $numbers[] = $number;
            $leaderColumns[] = $column;
        }

        if (!$leaderColumns) {
            throw ValidationException::withMessages(['file' => ['Minimal tersedia kolom "nik atasan 1".']]);
        }

        return $leaderColumns;
    }

    private function normalizeHeader($value): string
    {
        $header = strtolower(trim(str_replace(["\xEF\xBB\xBF", '_', '-'], ['', ' ', ' '], (string) $value)));
        return preg_replace('/\s+/', ' ', $header) ?: '';
    }

    private function normalizeNik($value): ?string
    {
        if (is_int($value) || (is_float($value) && floor($value) === $value)) {
            $value = number_format((float) $value, 0, '', '');
        }

        $value = trim((string) $value);
        if (!preg_match('/^\[?(\d{1,50})\]?(?:\s*-\s*.*)?$/u', $value, $matches)) {
            return null;
        }

        return $matches[1];
    }

    private function isBlank($value): bool
    {
        return $value === null || trim((string) $value) === '';
    }

    private function errorRow(int $row, $subordinate, $leader, string $reason): array
    {
        return [
            'row' => max(1, $row - 1),
            'subordinate_id' => $this->normalizeNik($subordinate) ?: trim((string) $subordinate),
            'leader_id' => $this->normalizeNik($leader) ?: trim((string) $leader),
            'reason' => $reason,
        ];
    }
}
