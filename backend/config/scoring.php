<?php

return [
    'default_rule' => [
        'task_weight' => 60,
        'attendance_weight' => 25,
        'evaluation_weight' => 15,
        'attendance_target' => 25,
        'attendance_included_statuses' => ['H', 'O', 'OP', 'CT'],
        'task_excluded_statuses' => ['O', 'OP', 'CT'],
        'cashier_task_weight' => 33.3333,
        'cashier_ibop_weight' => 33.3333,
        'cashier_push_selling_weight' => 33.3334,
    ],
    'ibop_bands' => [
        ['min' => 30000, 'score' => 100],
        ['min' => 25000, 'score' => 90],
        ['min' => 20000, 'score' => 80],
        ['min' => 15000, 'score' => 70],
        ['min' => 10000, 'score' => 60],
        ['min' => 5000, 'score' => 50],
        ['min' => 2000, 'score' => 40],
        ['min' => 1000, 'score' => 30],
        ['min' => 1, 'score' => 20],
        ['min' => 0, 'score' => 0],
    ],
    'push_selling_bands' => [
        ['min' => 1250, 'score' => 100],
        ['min' => 1000, 'score' => 95],
        ['min' => 750, 'score' => 85],
        ['min' => 500, 'score' => 75],
        ['min' => 250, 'score' => 65],
        ['min' => 100, 'score' => 50],
        ['min' => 0, 'score' => 40],
    ],
];
