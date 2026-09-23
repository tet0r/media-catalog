const { readZipEntryText } = require('./zipReader');

function decodeXmlEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

// Matches <dc:title>...</dc:title> or <title>...</title> regardless of
// namespace prefix, since EPUB producers vary in whether/how they declare
// "dc:". Deliberately simple regex extraction rather than a full XML
// parser — the Dublin Core metadata block in an EPUB's OPF file is a small,
// predictable, well-formed subset not worth a real parser for.
function extractTag(xml, tagLocalName) {
  const re = new RegExp(`<(?:[\\w-]+:)?${tagLocalName}[^>]*>([\\s\\S]*?)</(?:[\\w-]+:)?${tagLocalName}>`, 'i');
  const m = xml.match(re);
  if (!m) return null;
  const text = decodeXmlEntities(m[1].trim());
  return text || null;
}

function extractIsbn(opfXml) {
  // An OPF can list several <dc:identifier> entries (ISBN, ASIN, a
  // publisher-internal UUID, ...) — only the one explicitly scoped to ISBN
  // is useful for an Open Library lookup.
  const re = /<dc:identifier\b[^>]*\bscheme="ISBN"[^>]*>([\s\S]*?)<\/dc:identifier>/i;
  const m = opfXml.match(re);
  if (!m) return null;
  const digits = decodeXmlEntities(m[1].trim()).replace(/[^0-9Xx]/g, '');
  return digits || null;
}

// Reads title/author/ISBN straight out of an EPUB's own metadata (Dublin
// Core fields in its OPF package file) rather than guessing from the
// filename — authoritative when it's there, which beats parsing whatever
// naming convention the file happens to use. Returns null (not a throw) for
// anything that doesn't look like a well-formed EPUB, so a scan just falls
// back to filename guessing for that one file instead of aborting.
function readEpubMetadata(filePath) {
  try {
    const containerXml = readZipEntryText(filePath, 'META-INF/container.xml');
    if (!containerXml) return null;
    const pathMatch = containerXml.match(/full-path="([^"]+)"/i);
    if (!pathMatch) return null;

    const opfXml = readZipEntryText(filePath, pathMatch[1]);
    if (!opfXml) return null;

    const title = extractTag(opfXml, 'title');
    if (!title) return null;

    return {
      title,
      author: extractTag(opfXml, 'creator'),
      isbn: extractIsbn(opfXml),
    };
  } catch {
    return null;
  }
}

module.exports = { readEpubMetadata };
