import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HTML_ALTERNATES, SEO_METADATA } from './src/seoMetadata.js'

const HTML_ESCAPE_LOOKUP = {
  '&': '&amp;',
  '"': '&quot;',
  '<': '&lt;',
  '>': '&gt;',
}

const escapeHtml = (value) =>
  String(value).replace(/[&"<>]/g, (char) => HTML_ESCAPE_LOOKUP[char])

const localizedOgAlternates = (lang) =>
  Object.entries(SEO_METADATA)
    .filter(([code]) => code !== lang)
    .map(([, meta]) => `    <meta property="og:locale:alternate" content="${escapeHtml(meta.locale)}" />`)
    .join('\n')

const localizeHtml = (html, lang) => {
  const meta = SEO_METADATA[lang]
  if (!meta) return html

  const lines = html.split('\n')
  const alternateLinks = HTML_ALTERNATES.map(
    ([hreflang, href]) =>
      `    <link rel="alternate" hreflang="${escapeHtml(hreflang)}" href="${escapeHtml(href)}" />`,
  )
  const replaceLine = (needle, replacement) => {
    const index = lines.findIndex((line) => line.includes(needle))
    if (index >= 0) lines[index] = replacement
  }
  const replaceBlock = (startNeedle, endNeedle, replacements) => {
    const start = lines.findIndex((line) => line.includes(startNeedle))
    let end = -1
    if (startNeedle === endNeedle && start >= 0) {
      for (let index = start; index < lines.length; index += 1) {
        if (!lines[index].includes(endNeedle)) break
        end = index
      }
    } else {
      end = lines.findIndex((line, index) => index >= start && line.includes(endNeedle))
    }
    if (start >= 0 && end >= start) {
      lines.splice(start, end - start + 1, ...replacements)
    }
  }

  replaceLine('<html lang=', `<html lang="${escapeHtml(meta.htmlLang)}">`)
  replaceLine('<title>', `    <title>${escapeHtml(meta.title)}</title>`)
  replaceLine(
    '<meta name="description"',
    `    <meta name="description" content="${escapeHtml(meta.description)}" />`,
  )
  replaceLine(
    '<meta name="keywords"',
    `    <meta name="keywords" content="${escapeHtml(meta.keywords)}" />`,
  )
  replaceLine(
    '<link rel="canonical"',
    `    <link rel="canonical" href="${escapeHtml(meta.url)}" />`,
  )
  replaceBlock(
    '<link rel="alternate" hreflang="zh-Hant"',
    '<link rel="alternate" hreflang="x-default"',
    alternateLinks,
  )
  replaceLine(
    '<meta property="og:title"',
    `    <meta property="og:title" content="${escapeHtml(meta.title)}" />`,
  )
  replaceLine(
    '<meta property="og:description"',
    `    <meta property="og:description" content="${escapeHtml(meta.ogDescription || meta.description)}" />`,
  )
  replaceLine(
    '<meta property="og:url"',
    `    <meta property="og:url" content="${escapeHtml(meta.url)}" />`,
  )
  replaceLine(
    '<meta property="og:locale"',
    `    <meta property="og:locale" content="${escapeHtml(meta.locale)}" />`,
  )
  replaceBlock(
    '<meta property="og:locale:alternate"',
    '<meta property="og:locale:alternate"',
    localizedOgAlternates(lang).split('\n'),
  )
  replaceLine(
    '<meta name="twitter:title"',
    `    <meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
  )
  replaceLine(
    '<meta name="twitter:description"',
    `    <meta name="twitter:description" content="${escapeHtml(meta.ogDescription || meta.description)}" />`,
  )

  return lines.join('\n')
}

function localizedHtmlPlugin() {
  return {
    name: 'localized-html-pages',
    apply: 'build',
    writeBundle(options) {
      const outDir = options.dir || 'dist'
      const indexHtml = readFileSync(resolve(outDir, 'index.html'), 'utf8')

      for (const lang of ['en', 'ja']) {
        const langDir = resolve(outDir, lang)
        mkdirSync(langDir, { recursive: true })
        writeFileSync(resolve(langDir, 'index.html'), localizeHtml(indexHtml, lang), 'utf8')
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), localizedHtmlPlugin()],
  base: '/AutoCombo/',   // GitHub repo name
})
