import sys

with open('src/db/mysql.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. getRenewalCheckBatches query
target1 = """       SUM(CASE WHEN q.verification_status = 'CALL_PENDING' THEN 1 ELSE 0 END) as callPendingCount,
       SUM(CASE WHEN q.verification_status = 'ISSUE_REJECTED' THEN 1 ELSE 0 END) as rejectedCount,
       SUM(CASE WHEN q.verification_status = 'SKIPPED' THEN 1 ELSE 0 END) as skippedCount
     FROM renewal_check_batch b"""

repl1 = """       SUM(CASE WHEN q.verification_status = 'CALL_PENDING' THEN 1 ELSE 0 END) as callPendingCount,
       SUM(CASE WHEN q.verification_status = 'ISSUE_REJECTED' THEN 1 ELSE 0 END) as rejectedCount,
       SUM(CASE WHEN q.verification_status = 'SKIPPED' THEN 1 ELSE 0 END) as skippedCount,
       SUM(CASE WHEN q.verification_status = 'BLOCKED' THEN 1 ELSE 0 END) as blockedCount
     FROM renewal_check_batch b"""

assert target1 in content, "target1 not found"
content = content.replace(target1, repl1, 1)

# stats mapping in getRenewalCheckBatches
target2 = """    const rejected = Number(r.rejectedCount || 0);
    const skipped = Number(r.skippedCount || 0);
    const pending = Number(r.pendingCount || 0);
    const processed = renewed + alreadyRenewed + callPending + rejected + skipped;"""

repl2 = """    const rejected = Number(r.rejectedCount || 0);
    const skipped = Number(r.skippedCount || 0);
    const blocked = Number(r.blockedCount || 0);
    const pending = Number(r.pendingCount || 0);
    const processed = renewed + alreadyRenewed + callPending + rejected + skipped + blocked;"""

assert target2 in content, "target2 not found"
content = content.replace(target2, repl2, 1)

target3 = """      skippedCount: skipped,
      pendingCount: pending,"""

repl3 = """      skippedCount: skipped,
      blockedCount: blocked,
      pendingCount: pending,"""

assert target3 in content, "target3 not found"
content = content.replace(target3, repl3, 1)

target4 = """        rejected,
        skipped,
        completionPercentage,"""

repl4 = """        rejected,
        skipped,
        blocked,
        completionPercentage,"""

assert target4 in content, "target4 not found"
content = content.replace(target4, repl4, 1)

# 2. Update the 3 batch counter SQL blocks (update, delete single, delete bulk)
target_counter_sql = """       call_pending_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'CALL_PENDING'),
       issue_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'ISSUE_REJECTED'),
       skipped_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'SKIPPED'),
       pending_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'PENDING')"""

repl_counter_sql = """       call_pending_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'CALL_PENDING'),
       issue_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'ISSUE_REJECTED'),
       skipped_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'SKIPPED'),
       blocked_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'BLOCKED'),
       pending_count = (SELECT COUNT(id) FROM renewal_check_queue WHERE batch_id = b.batch_id AND verification_status = 'PENDING')"""

assert content.count(target_counter_sql) == 3, f"Expected 3 occurrences of target_counter_sql, found {content.count(target_counter_sql)}"
content = content.replace(target_counter_sql, repl_counter_sql)

# 3. Update the 4 SELECT stats queries (details, update, delete single, delete bulk)
target_sel_stat = """       SUM(CASE WHEN verification_status = 'CALL_PENDING' THEN 1 ELSE 0 END) as callPending,
       SUM(CASE WHEN verification_status = 'ISSUE_REJECTED' THEN 1 ELSE 0 END) as rejected,
       SUM(CASE WHEN verification_status = 'SKIPPED' THEN 1 ELSE 0 END) as skipped
     FROM renewal_check_queue WHERE batch_id = ?"""

repl_sel_stat = """       SUM(CASE WHEN verification_status = 'CALL_PENDING' THEN 1 ELSE 0 END) as callPending,
       SUM(CASE WHEN verification_status = 'ISSUE_REJECTED' THEN 1 ELSE 0 END) as rejected,
       SUM(CASE WHEN verification_status = 'SKIPPED' THEN 1 ELSE 0 END) as skipped,
       SUM(CASE WHEN verification_status = 'BLOCKED' THEN 1 ELSE 0 END) as blocked
     FROM renewal_check_queue WHERE batch_id = ?"""

assert content.count(target_sel_stat) == 4, f"Expected 4 occurrences of target_sel_stat, found {content.count(target_sel_stat)}"
content = content.replace(target_sel_stat, repl_sel_stat)

# 4. Details calculation & mapping
target_calc_details = """  const rejected = Number(statRow.rejected || 0);
  const skipped = Number(statRow.skipped || 0);
  const pending = Number(statRow.pending || 0);
  const processed = renewed + alreadyRenewed + callPending + rejected + skipped;"""

repl_calc_details = """  const rejected = Number(statRow.rejected || 0);
  const skipped = Number(statRow.skipped || 0);
  const blocked = Number(statRow.blocked || 0);
  const pending = Number(statRow.pending || 0);
  const processed = renewed + alreadyRenewed + callPending + rejected + skipped + blocked;"""

assert target_calc_details in content, "target_calc_details not found"
content = content.replace(target_calc_details, repl_calc_details, 1)

target_calc = """  const rejectedCount = Number(statRow.rejected || 0);
  const skippedCount = Number(statRow.skipped || 0);
  const pendingCount = Number(statRow.pending || 0);
  const processed = renewedCount + alreadyRenewedCount + callPendingCount + rejectedCount + skippedCount;"""

repl_calc = """  const rejectedCount = Number(statRow.rejected || 0);
  const skippedCount = Number(statRow.skipped || 0);
  const blockedCount = Number(statRow.blocked || 0);
  const pendingCount = Number(statRow.pending || 0);
  const processed = renewedCount + alreadyRenewedCount + callPendingCount + rejectedCount + skippedCount + blockedCount;"""

assert content.count(target_calc) == 3, f"Expected 3 occurrences of target_calc, found {content.count(target_calc)}"
content = content.replace(target_calc, repl_calc)

target_stat_details = """    rejected,
    skipped,
    completionPercentage,"""

repl_stat_details = """    rejected,
    skipped,
    blocked,
    completionPercentage,"""

assert target_stat_details in content, "target_stat_details not found"
content = content.replace(target_stat_details, repl_stat_details, 1)

target_stat_rest = """    rejected: rejectedCount,
    skipped: skippedCount,
    completionPercentage,"""

repl_stat_rest = """    rejected: rejectedCount,
    skipped: skippedCount,
    blocked: blockedCount,
    completionPercentage,"""

assert content.count(target_stat_rest) == 3, f"Expected 3 occurrences of target_stat_rest, found {content.count(target_stat_rest)}"
content = content.replace(target_stat_rest, repl_stat_rest)

# 5. Export filter
target_export_filter = """  } else if (filter === 'ISSUE_REJECTED') {
    query += ` AND q.verification_status = 'ISSUE_REJECTED'`;
  }"""

repl_export_filter = """  } else if (filter === 'ISSUE_REJECTED') {
    query += ` AND q.verification_status = 'ISSUE_REJECTED'`;
  } else if (filter === 'BLOCKED') {
    query += ` AND q.verification_status = 'BLOCKED'`;
  }"""

assert target_export_filter in content, "target_export_filter not found"
content = content.replace(target_export_filter, repl_export_filter, 1)

# Export status label
target_export_label = """    if (r.verification_status === 'SKIPPED') statusLabel = 'वगळले (SKIPPED)';"""
repl_export_label = """    if (r.verification_status === 'SKIPPED') statusLabel = 'वगळले (SKIPPED)';
    if (r.verification_status === 'BLOCKED') statusLabel = 'ब्लॉक / कधीच नाही (BLOCKED)';"""

assert target_export_label in content, "target_export_label not found"
content = content.replace(target_export_label, repl_export_label, 1)

with open('src/db/mysql.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("SUCCESS: src/db/mysql.ts updated with BLOCKED status handling!")
