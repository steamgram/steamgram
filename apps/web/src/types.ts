export type Game = {
  appid: number
  name: string
  short_description: string
  header_image: string
  background: string | null
  trailer_mp4: string | null
  trailer_hls: string | null
  trailer_thumb: string | null
  screenshots: string[]
  genres: string[]
  tags: string[]
  developers: string[]
  platforms: string[]
  is_free: boolean
  price_final: number | null
  price_initial: number | null
  discount_percent: number | null
  price_formatted: string | null
  release_date: string | null
  review_summary: string | null
  review_percent: number | null
  review_count: number | null
  metacritic: number | null
}

export type FeedPage = { games: Game[]; pool: number }
