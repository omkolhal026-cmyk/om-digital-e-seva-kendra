/**
 * Export utilities for Excel (CSV) generation and formatted browser printing
 */

export function exportToCSV(filename: string, rows: Record<string, any>[]) {
  if (!rows || rows.length === 0) {
    alert('No data available to export.');
    return;
  }

  const headers = Object.keys(rows[0]);
  const csvContent = [
    headers.join(','),
    ...rows.map(row =>
      headers
        .map(fieldName => {
          let value = row[fieldName] ?? '';
          if (typeof value === 'object') {
            value = JSON.stringify(value);
          }
          const stringVal = String(value).replace(/"/g, '""');
          return `"${stringVal}"`;
        })
        .join(',')
    ),
  ].join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function printFormattedElement(title: string, htmlContent: string) {
  const printWindow = window.open('', '_blank', 'width=900,height=750');
  if (!printWindow) {
    alert('Please allow popups to enable printing feature.');
    return;
  }

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            color: #1e293b;
            margin: 0;
            padding: 24px;
            background: #fff;
          }
          .header {
            text-align: center;
            border-bottom: 3px double #0284c7;
            padding-bottom: 16px;
            margin-bottom: 24px;
          }
          .header h1 {
            color: #0369a1;
            margin: 0 0 6px 0;
            font-size: 24px;
            text-transform: uppercase;
            letter-spacing: 1px;
          }
          .header p {
            margin: 2px 0;
            font-size: 13px;
            color: #475569;
          }
          .badge {
            display: inline-block;
            background: #e0f2fe;
            color: #0369a1;
            padding: 4px 12px;
            border-radius: 999px;
            font-weight: 600;
            font-size: 12px;
            margin-top: 8px;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 16px;
          }
          th, td {
            border: 1px solid #cbd5e1;
            padding: 10px 12px;
            text-align: left;
            font-size: 13px;
          }
          th {
            background-color: #f1f5f9;
            color: #0f172a;
            font-weight: 600;
          }
          .footer {
            margin-top: 40px;
            border-top: 1px solid #e2e8f0;
            padding-top: 16px;
            display: flex;
            justify-content: space-between;
            font-size: 12px;
            color: #64748b;
          }
          .stamp-box {
            border: 1px dashed #94a3b8;
            width: 160px;
            height: 70px;
            text-align: center;
            line-height: 70px;
            color: #94a3b8;
            font-size: 11px;
          }
          @media print {
            body { padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        ${htmlContent}
        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
}
