import fs from 'node:fs'
import path from 'node:path'
import type { PersistedData, Storage } from '../shared/controller'

/** userData 폴더의 JSON 파일 하나에 저장한다. 모든 데이터는 로컬에만 남는다. */
export class JsonFileStorage implements Storage {
  constructor(private readonly file: string) {}

  load(): PersistedData | null {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8')) as PersistedData
    } catch {
      return null
    }
  }

  save(data: PersistedData): void {
    fs.mkdirSync(path.dirname(this.file), { recursive: true })
    const tmp = `${this.file}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8')
    fs.renameSync(tmp, this.file)
  }
}
