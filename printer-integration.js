/* ===================== BLUETOOTH THERMAL PRINTER ===================== */
/* 
  Ye file index.html ke last <script> ke end mein paste kar do
  (saare existing functions ke baad, </script> se pehle)
*/

async function printThermalBluetooth() {
  if (!printModalFeeId) {
    alert('Koi fee selected nahi hai');
    return;
  }

  const f = fees.find(x => x.id === printModalFeeId);
  if (!f) {
    alert('Fee record nahi mila');
    return;
  }

  const student = students.find(s => s.id === f.studentId);

  try {
    if (!window.schoolPrinter || !window.schoolPrinter.isConnected) {
      await window.schoolPrinter.connect();
    }

    await window.schoolPrinter.printFeeReceipt({
      studentName: student ? student.name : 'Unknown',
      className: student ? ((student.cls || '') + (student.section ? '-' + student.section : '')) : '—',
      amount: f.amount,
      receiptNo: f.id || '—',
      date: f.due || f.month || new Date().toLocaleDateString(),
      status: f.status || 'paid'
    });

    alert('✅ Receipt Bluetooth printer pe print ho gayi!');
  } catch (err) {
    console.error(err);
    alert('❌ Print Failed:\n' + err.message + '\n\nChrome browser use karein aur Bluetooth on rakhein.');
  }
}

async function printFeeDirect(feeId) {
  printModalFeeId = feeId;
  await printThermalBluetooth();
}

async function connectSchoolPrinter() {
  try {
    const name = await window.schoolPrinter.connect();
    alert('Printer Connected: ' + name);
  } catch (err) {
    alert('Connection Failed:\n' + err.message);
  }
}
