export function parseDavibank(text: string): { amount: number; currency: string; description: string; date: string } | null {
  try {
    // Format: "por un monto de USD 426.00. La transacción se realizó el día 30-07-2026 20:46:41"
    const amountMatch = text.match(/monto de (USD|CRC)\s*([\d,]+\.?\d*)/)
    const dateMatch = text.match(/el día (\d{2}-\d{2}-\d{4})/)

    if (!amountMatch || !dateMatch) return null

    const currency = amountMatch[1]
    const amount = parseFloat(amountMatch[2].replace(/,/g, ''))
    const date = dateMatch[1].split('-').reverse().join('-') // convert 30-07-2026 to 2026-07-30
    const description = 'DAVIbank transaction'

    if (!amount) return null
    return { amount, currency, description, date }
  } catch {
    return null
  }
}
