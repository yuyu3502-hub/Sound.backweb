import fs from 'node:fs'

const BANNED_PHRASES = [
  'DTM制作に使える',
  '楽曲制作に使える',
  '音作りの幅を広げる',
  '高品質な',
  '多彩な',
  '強力な',
  '便利な',
  '無料なのでチェック',
  'ガチでヤバい',
  '絶対応募',
  '絶対入れろ',
  '人生変わる',
  '99%知らない',
]

const ALLOWED_PRODUCT_TYPES = new Set([
  'instrument',
  'effect',
  'sample_pack',
  'preset_pack',
  'midi_tool',
  'utility',
  'hardware',
])

const BLOCKED_PRODUCT_TYPES = new Set(['article', 'unknown'])
const BLOCKED_DEAL_TYPES = new Set(['unknown', ''])

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function textLength(value) {
  return Array.from(String(value ?? '')).length
}

function includesLoose(haystack, needle) {
  const n = clean(needle)
  if (!n) return false
  return String(haystack ?? '').toLowerCase().includes(n.toLowerCase())
}

function readInput() {
  const file = process.argv[2]
  if (file) return fs.readFileSync(file, 'utf8')
  return fs.readFileSync(0, 'utf8')
}

function parseInput(raw) {
  const text = String(raw ?? '').trim()
  if (!text) throw new Error('empty input')
  try {
    return JSON.parse(text)
  } catch {
    return { postText: text }
  }
}

function normalizeDraft(value) {
  const draft = value?.json && typeof value.json === 'object' ? value.json : value
  return {
    maker: clean(draft.maker),
    product_name: clean(draft.product_name || draft.productName || draft.product),
    product_type: clean(draft.product_type || draft.productType),
    deal_type: clean(draft.deal_type || draft.dealType),
    sourceUrl: clean(draft.sourceUrl || draft.url),
    confidence: Number.isFinite(Number(draft.confidence)) ? Number(draft.confidence) : null,
    postText: String(draft.postText || draft.text || draft.llm_post_text || '').trim(),
    sourceName: clean(draft.sourceName || draft.source),
    publishedAt: clean(draft.publishedAt),
  }
}

function checkDraft(rawDraft) {
  const draft = normalizeDraft(rawDraft)
  const flags = []
  const warnings = []
  const postText = draft.postText
  const charCount = textLength(postText)

  if (!postText) flags.push('missing_post_text')
  if (charCount > 280) flags.push(`too_long_${charCount}`)
  if (charCount > 0 && charCount < 140) warnings.push(`short_${charCount}`)
  if (charCount > 220 && charCount <= 280) warnings.push(`long_but_within_x_limit_${charCount}`)

  if (!draft.sourceUrl && !/https?:\/\/\S+/i.test(postText)) flags.push('missing_url')
  if (!/#DTM/.test(postText)) flags.push('missing_hashtag_dtm')
  if (!/#DTMer/.test(postText)) flags.push('missing_hashtag_dtmer')

  for (const phrase of BANNED_PHRASES) {
    if (postText.includes(phrase)) flags.push(`banned_phrase_${phrase}`)
  }

  if (!draft.maker) flags.push('missing_maker')
  if (!draft.product_name) flags.push('missing_product_name')
  if (draft.maker && !includesLoose(postText, draft.maker)) flags.push('post_missing_maker')
  if (draft.product_name && !includesLoose(postText, draft.product_name)) flags.push('post_missing_product_name')

  const productType = draft.product_type.toLowerCase()
  if (!productType) flags.push('missing_product_type')
  if (BLOCKED_PRODUCT_TYPES.has(productType)) flags.push(`blocked_product_type_${productType}`)
  if (productType && !ALLOWED_PRODUCT_TYPES.has(productType) && !BLOCKED_PRODUCT_TYPES.has(productType)) {
    flags.push(`invalid_product_type_${productType}`)
  }

  const dealType = draft.deal_type.toLowerCase()
  if (BLOCKED_DEAL_TYPES.has(dealType)) flags.push('unknown_deal_type')

  if (draft.confidence !== null && draft.confidence < 90) flags.push(`low_confidence_${draft.confidence}`)

  if (productType === 'sample_pack' && /(プラグイン|ソフト音源)/.test(postText)) {
    flags.push('sample_pack_mislabeled_as_plugin_or_instrument')
  }
  if (productType === 'preset_pack' && /プラグイン/.test(postText)) {
    flags.push('preset_pack_mislabeled_as_plugin')
  }
  if (productType === 'effect' && /ソフト音源/.test(postText)) {
    flags.push('effect_mislabeled_as_instrument')
  }

  if (/過去最安/.test(postText) && !/(historic|lowest|過去最安|過去最安値)/i.test(clean(rawDraft.evidence || rawDraft.reason || rawDraft.description))) {
    warnings.push('historic_low_claim_needs_explicit_evidence')
  }
  if (/7\/|8\/|9\/|10\/|11\/|12\/|まで|本日|明日|期間限定/.test(postText) && !draft.sourceUrl) {
    flags.push('deadline_or_urgency_without_source_url')
  }

  const hardExclude =
    flags.includes('blocked_product_type_article') ||
    flags.includes('blocked_product_type_unknown') ||
    (flags.includes('missing_maker') && flags.includes('missing_product_name')) ||
    (flags.includes('unknown_deal_type') && (draft.confidence === null || draft.confidence < 80))

  const gate = hardExclude ? 'exclude' : flags.length ? 'needs_review' : 'post_ok'

  return {
    gate,
    ok: gate === 'post_ok',
    charCount,
    flags,
    warnings,
    draft,
  }
}

function main() {
  const parsed = parseInput(readInput())
  const drafts = Array.isArray(parsed) ? parsed : Array.isArray(parsed.drafts) ? parsed.drafts : [parsed]
  const results = drafts.map(checkDraft)
  const summary = {
    total: results.length,
    post_ok: results.filter((r) => r.gate === 'post_ok').length,
    needs_review: results.filter((r) => r.gate === 'needs_review').length,
    exclude: results.filter((r) => r.gate === 'exclude').length,
  }

  console.log(JSON.stringify({ ok: summary.needs_review === 0 && summary.exclude === 0, summary, results }, null, 2))

  if (summary.needs_review || summary.exclude) process.exitCode = 1
}

try {
  main()
} catch (error) {
  console.error(JSON.stringify({ ok: false, error: error.message }, null, 2))
  process.exitCode = 1
}
