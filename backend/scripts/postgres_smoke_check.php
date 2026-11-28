<?php

declare(strict_types=1);

$dbDatabase = getenv('DB_DATABASE') ?: '';
if ($dbDatabase === '' || strcasecmp($dbDatabase, 'ppa') === 0) {
    fwrite(STDERR, "Refusing to run PostgreSQL smoke check: DB_DATABASE must be set to a disposable database, never 'ppa'.\n");
    exit(1);
}

$dbHost = getenv('DB_HOST') ?: '127.0.0.1';
$dbPort = getenv('DB_PORT') ?: '5432';
$dbUsername = getenv('DB_USERNAME') ?: '';
$dbPassword = getenv('DB_PASSWORD') ?: '';

$dsn = sprintf('pgsql:host=%s;port=%s;dbname=%s', $dbHost, $dbPort, $dbDatabase);
$pdo = new PDO($dsn, $dbUsername, $dbPassword, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

function assertTrue(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "SMOKE CHECK FAILED: {$message}\n");
        exit(1);
    }
}

$migrationCount = (int) $pdo->query('SELECT COUNT(*) FROM public.migrations')->fetchColumn();
assertTrue($migrationCount >= 61, "Expected at least 61 migrations applied, found {$migrationCount}.");

$compositeFkCount = (int) $pdo->query(
    "SELECT COUNT(*)
     FROM pg_constraint
     WHERE contype = 'f'
       AND conrelid IN ('public.tasks'::regclass, 'public.monthly_personality_evaluations'::regclass)
       AND confrelid = 'public.reporting_lines'::regclass"
)->fetchColumn();
assertTrue($compositeFkCount === 0, "Expected 0 composite FKs referencing reporting_lines, found {$compositeFkCount}.");

$expectedRestrictFks = [
    'tasks_employer_id_users_fk' => 'public.tasks',
    'tasks_employee_id_users_fk' => 'public.tasks',
    'mpe_evaluator_id_users_fk' => 'public.monthly_personality_evaluations',
    'mpe_evaluatee_id_users_fk' => 'public.monthly_personality_evaluations',
];

$fkStmt = $pdo->prepare(
    "SELECT conname, conrelid::regclass::text AS table_name, confrelid::regclass::text AS ref_table, confdeltype
     FROM pg_constraint
     WHERE contype = 'f'
       AND conname = :conname"
);

foreach ($expectedRestrictFks as $fkName => $tableName) {
    $fkStmt->execute([':conname' => $fkName]);
    $row = $fkStmt->fetch();
    assertTrue($row !== false, "Missing expected FK constraint {$fkName}.");
    assertTrue($row['table_name'] === str_replace('public.', '', $tableName) || $row['table_name'] === $tableName, "Unexpected table for {$fkName}: {$row['table_name']}");
    assertTrue($row['ref_table'] === 'users' || $row['ref_table'] === 'public.users', "Expected {$fkName} to reference users, got {$row['ref_table']}.");
    assertTrue($row['confdeltype'] === 'r', "Expected ON DELETE RESTRICT ('r') for {$fkName}, got '{$row['confdeltype']}'.");
}

$idxStmt = $pdo->prepare(
    "SELECT idx.indisunique
     FROM pg_index idx
     JOIN pg_class cls ON cls.oid = idx.indexrelid
     JOIN pg_class tbl ON tbl.oid = idx.indrelid
     JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
     WHERE ns.nspname = 'public'
       AND tbl.relname = :table_name
       AND cls.relname = :index_name"
);
$idxStmt->execute([
    ':table_name' => 'monthly_personality_evaluations',
    ':index_name' => 'mpe_unique_eval_period_type_idx',
]);
$mpeUniqueIdx = $idxStmt->fetch();
assertTrue($mpeUniqueIdx !== false && (bool) $mpeUniqueIdx['indisunique'] === true, 'Missing unique index mpe_unique_eval_period_type_idx on monthly_personality_evaluations.');

$expectedChecks = [
    'mt_status_check' => 'manager_tasks',
    'mte_review_status_check' => 'manager_task_evidences',
    'mte_attempt_no_check' => 'manager_task_evidences',
    'mte_type_check' => 'manager_task_evidences',
];

$checkStmt = $pdo->prepare(
    "SELECT conrelid::regclass::text AS table_name
     FROM pg_constraint
     WHERE contype = 'c'
       AND conname = :conname"
);
foreach ($expectedChecks as $checkName => $tableName) {
    $checkStmt->execute([':conname' => $checkName]);
    $row = $checkStmt->fetch();
    assertTrue($row !== false, "Missing CHECK constraint {$checkName}.");
    assertTrue($row['table_name'] === $tableName || $row['table_name'] === "public.{$tableName}", "Unexpected table for CHECK {$checkName}: {$row['table_name']}.");
}

$expectedIndexes = [
    'mtab_created_by_idx' => 'manager_task_assignment_batches',
    'mt_assignment_batch_id_idx' => 'manager_tasks',
    'mt_status_start_at_idx' => 'manager_tasks',
    'mt_status_due_at_idx' => 'manager_tasks',
    'mt_approval_deadline_at_idx' => 'manager_tasks',
    'mte_reviewed_by_idx' => 'manager_task_evidences',
];
foreach ($expectedIndexes as $indexName => $tableName) {
    $idxStmt->execute([
        ':table_name' => $tableName,
        ':index_name' => $indexName,
    ]);
    $row = $idxStmt->fetch();
    assertTrue($row !== false, "Missing index {$indexName} on {$tableName}.");
}

$pdo->beginTransaction();
try {
    $jobLevelId = (int) $pdo->query("INSERT INTO public.job_levels (name) VALUES ('smoke_level') RETURNING id")->fetchColumn();

    $userInsert = $pdo->prepare(
        "INSERT INTO public.users (name, username, password, job_level_id) VALUES (:name, :username, :password, :job_level_id)"
    );
    $userInsert->execute([
        ':name' => 'Smoke Leader',
        ':username' => 'smoke_leader',
        ':password' => 'hashed',
        ':job_level_id' => $jobLevelId,
    ]);
    $userInsert->execute([
        ':name' => 'Smoke Subordinate',
        ':username' => 'smoke_sub',
        ':password' => 'hashed',
        ':job_level_id' => $jobLevelId,
    ]);

    $pdo->exec("INSERT INTO public.reporting_lines (leader_id, subordinate_id) VALUES ('smoke_leader', 'smoke_sub')");
    $taskId = (int) $pdo->query(
        "INSERT INTO public.tasks (employee_id, employer_id, title, due_at)
         VALUES ('smoke_sub', 'smoke_leader', 'Smoke Task', '2026-10-15 17:00:00')
         RETURNING id"
    )->fetchColumn();
    $evalId = (int) $pdo->query(
        "INSERT INTO public.monthly_personality_evaluations (evaluatee_id, evaluator_id, evaluation_period, score, evaluation_type)
         VALUES ('smoke_sub', 'smoke_leader', '2026-10-01', 85, 'personality')
         RETURNING id"
    )->fetchColumn();

    $pdo->exec("DELETE FROM public.reporting_lines WHERE leader_id = 'smoke_leader' AND subordinate_id = 'smoke_sub'");

    $taskStillExists = (int) $pdo->query("SELECT COUNT(*) FROM public.tasks WHERE id = {$taskId}")->fetchColumn();
    $evalStillExists = (int) $pdo->query("SELECT COUNT(*) FROM public.monthly_personality_evaluations WHERE id = {$evalId}")->fetchColumn();
    assertTrue($taskStillExists === 1, 'Task was cascade-deleted when reporting_lines row was removed.');
    assertTrue($evalStillExists === 1, 'Evaluation was cascade-deleted when reporting_lines row was removed.');

    $pdo->exec('SAVEPOINT dup_eval_probe');
    $dupBlocked = false;
    try {
        $pdo->exec(
            "INSERT INTO public.monthly_personality_evaluations (evaluatee_id, evaluator_id, evaluation_period, score, evaluation_type)
             VALUES ('smoke_sub', 'smoke_leader', '2026-10-01', 90, 'personality')"
        );
    } catch (PDOException $e) {
        if ($e->getCode() === '23505') {
            $dupBlocked = true;
        }
    }
    $pdo->exec('ROLLBACK TO SAVEPOINT dup_eval_probe');
    assertTrue($dupBlocked, 'Duplicate monthly_personality_evaluations insert did not fail with SQLSTATE 23505.');

    $pdo->exec('SAVEPOINT user_restrict_probe');
    $restrictBlocked = false;
    $restrictCode = null;
    $restrictError = 'no exception thrown';
    try {
        $affected = $pdo->exec("DELETE FROM public.users WHERE username = 'smoke_sub'");
        $restrictError = "DELETE unexpectedly succeeded (affected={$affected})";
    } catch (PDOException $e) {
        $restrictCode = (string) $e->getCode();
        $restrictError = $e->getMessage();
        if (in_array($restrictCode, ['23503', '23001'], true)) {
            $restrictBlocked = true;
        }
    }
    $pdo->exec('ROLLBACK TO SAVEPOINT user_restrict_probe');
    assertTrue($restrictBlocked, "Deleting referenced user did not fail with FK restrict SQLSTATE (code={$restrictCode}, detail={$restrictError}).");

    $pdo->rollBack();
} catch (Throwable $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    fwrite(STDERR, "SMOKE CHECK ERROR: {$e->getMessage()}\n");
    exit(1);
}

echo "PostgreSQL smoke check passed:\n";
echo "- migrations={$migrationCount}\n";
echo "- reporting_lines_composite_fks=0\n";
echo "- restrict_fks=4, unique_indexes=1, check_constraints=4, manager_indexes=6\n";
echo "- behavioral_probes=reporting_lines_delete_preserved_history,duplicate_eval_23505,user_restrict_{$restrictCode}\n";
