import * as cheerio from 'cheerio'

export function parseBCR(html: string): { amount: number; currency: string; description: string; date: string } | null {
  try {
    const $ = cheerio.load(html)
    let amount = 0
    let currency = 'CRC'
    let description = ''
    let date = ''

    // BCR uses a table with headers: Fecha | Autorización | No.Referencia | Monto | Moneda | Comercio | Estado
    $('tr').each((_, row) => {
      const cells = $(row).find('td')
      if (cells.length >= 7) {
        const dateText = $(cells[0]).text().trim()
        const amountText = $(cells[3]).text().trim()
        const moneda = $(cells[4]).text().trim()
        const comercio = $(cells[5]).text().trim()
        const estado = $(cells[6]).text().trim()

        if (estado === 'Aprobada' && amountText && comercio) {
          amount = parseFloat(amountText.replace(/,/g, ''))
          currency = moneda.includes('DOLAR') ? 'USD' : 'CRC'
          description = comercio
          date = dateText
        }
      }
    })

    if (!amount || !description) return null

    // Convert date from DD/MM/YYYY HH:MM:SS to YYYY-MM-DD
    const p = date.split('/')
    const year = p.length === 3 ? p[2].split(' ')[0] : ''
    const formattedDate = p.length === 3 ? `${year}-${p[1]}-${p[0]}` : date

    return { amount, currency, description, date: formattedDate }
  } catch {
    return null
  }
}
