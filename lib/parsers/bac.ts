import * as cheerio from 'cheerio'

export function parseBAC(html: string): { amount: number; currency: string; description: string; date: string } | null {
  try {
    const $ = cheerio.load(html)
    let amount = 0
    let currency = 'CRC'
    let description = ''
    let date = ''

    $('td').each((_, el) => {
      const text = $(el).text().trim()
      if (text.startsWith('CRC') || text.startsWith('USD')) {
        const parts = text.split(/\s+/)
        currency = parts[0]
        amount = parseFloat(parts[1].replace(/,/g, ''))
      }
    })

    $('tr').each((_, row) => {
      const cells = $(row).find('td')
      cells.each((i, cell) => {
        const label = $(cell).text().trim()
        if (label === 'Comercio:') {
          description = $(cells[i + 1]).text().trim()
        }
        if (label === 'Fecha:') {
          date = $(cells[i + 1]).text().trim()
        }
      })
    })

    if (!amount || !description) return null
    return { amount, currency, description, date }
  } catch {
    return null
  }
}
