import { migrate } from './migrate'

migrate().catch((err) => {
  console.error(err)
  process.exit(1)
})
