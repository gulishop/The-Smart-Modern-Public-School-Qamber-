========================================
THERMAL PRINTER — ADJUSTABLE SETTINGS
The Smart Modern Public School Qamber
========================================

FILES (repo ROOT):
1. index.html
2. thermal-printer.js

DEFAULT SETTINGS (HiLabel 58mm ke liye tuned):
  paperWidth     : 58     (58 or 80)
  chunkSize      : 48     (chhota = zyada reliable)
  chunkDelay     : 40     (ms, 30-60 safe)
  feedBeforeCut  : 1      (kam paper waste)
  usePartialCut  : true   (kam paper advance)

AGAR SETTINGS CHANGE KARNI HON:
Browser console (F12) mein yeh type karo:

  // 80mm paper ke liye
  schoolPrinter.setSettings({ paperWidth: 80 })

  // Zyada paper feed chahiye ho to
  schoolPrinter.setSettings({ feedBeforeCut: 2 })

  // Full cut chahiye ho to
  schoolPrinter.setSettings({ usePartialCut: false })

  // Agar print incomplete aaye to delay badhao
  schoolPrinter.setSettings({ chunkDelay: 60, chunkSize: 32 })

PRINT:
Fees → Print → "🧾 Print on Thermal Printer"
