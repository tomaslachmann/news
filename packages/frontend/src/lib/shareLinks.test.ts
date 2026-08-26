import { describe, it, expect } from 'vitest'
import { buildShareLinks } from './shareLinks'

const TITLE = 'Vláda schválila rozpočet & nové výdaje'
const URL = 'https://triangulator.cz/article/abc123?ref=test'

describe('buildShareLinks', () => {
  it('builds a Facebook sharer URL with the article URL encoded', () => {
    const links = buildShareLinks(TITLE, URL)
    expect(links.facebook).toBe(
      'https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Ftriangulator.cz%2Farticle%2Fabc123%3Fref%3Dtest'
    )
  })

  it('builds an X intent URL with both the title and the URL encoded', () => {
    const links = buildShareLinks(TITLE, URL)
    expect(links.x).toBe(
      'https://twitter.com/intent/tweet?url=https%3A%2F%2Ftriangulator.cz%2Farticle%2Fabc123%3Fref%3Dtest&text=Vl%C3%A1da%20schv%C3%A1lila%20rozpo%C4%8Det%20%26%20nov%C3%A9%20v%C3%BDdaje'
    )
  })

  it('builds a WhatsApp send URL with the title and URL both encoded into one text param', () => {
    const links = buildShareLinks(TITLE, URL)
    expect(links.whatsapp).toBe(
      'https://api.whatsapp.com/send?text=Vl%C3%A1da%20schv%C3%A1lila%20rozpo%C4%8Det%20%26%20nov%C3%A9%20v%C3%BDdaje%20https%3A%2F%2Ftriangulator.cz%2Farticle%2Fabc123%3Fref%3Dtest'
    )
  })

  it('builds a mailto: URL with the title as subject and the URL as body', () => {
    const links = buildShareLinks(TITLE, URL)
    expect(links.email).toBe(
      'mailto:?subject=Vl%C3%A1da%20schv%C3%A1lila%20rozpo%C4%8Det%20%26%20nov%C3%A9%20v%C3%BDdaje&body=https%3A%2F%2Ftriangulator.cz%2Farticle%2Fabc123%3Fref%3Dtest'
    )
  })
})
