/**
 * Counselor Summary PDF (PDFKit, Letter, Helvetica).
 */

const PDFDocument = require('pdfkit');

const NAVY = '#1a1f36';
const CORAL = '#e85d3a';
const TEAL = '#0d9488';
const AMBER = '#d97706';
const RED = '#dc2626';
const ROW_GRAY = '#f8f9fb';
const MUTED = '#6b7280';

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50;
const CONTENT_W = PAGE_W - 2 * MARGIN;
/** Keep body text above this Y so post-hoc footers are not covered */
const CONTENT_MAX_Y = PAGE_H - 52;
const FOOTER_TEXT_Y = PAGE_H - 40;

const SECTION_GAP = 16;
const ITEM_GAP = 9;
const PRIORITY_BLOCK_GAP = 15;
const TABLE_ROW_H = 26;
const TABLE_HEADER_H = 26;
const PATTERNS_AFTER_TABLE_GAP = 10;

/** Mirrors insightPostProcess.js DIM_KEYWORDS for weakness ↔ dimension matching */
const DIM_KEYWORDS = {
  academic: ['gpa', 'grade', 'transcript', 'course', 'rigor', 'ap ', ' ib', 'sat', 'act', 'class', 'academic', 'school'],
  activities: ['extracurricular', 'activity', 'club', 'sport', 'volunteer', 'leadership', 'officer', 'president', 'captain', 'team'],
  honors: ['award', 'honor', 'scholar', 'recognition', 'medal', 'prize'],
  narrative: ['essay', 'personal statement', 'writing', 'story', 'voice', 'narrative', 'reflection'],
  institutionalFit: ['fit', 'major', 'campus', 'culture', 'mission', 'institution', 'university', 'program', 'computer science'],
};

const DIMENSION_ROWS = [
  { field: 'academicStrength', insight: 'academic', label: 'Academic Strength' },
  { field: 'activityImpact', insight: 'activities', label: 'Activity Impact' },
  { field: 'honorsAwards', insight: 'honors', label: 'Honors & Awards' },
  { field: 'narrativeStrength', insight: 'narrative', label: 'Narrative Strength' },
  { field: 'institutionalFit', insight: 'institutionalFit', label: 'Institutional Fit' },
];

function abbreviateSchoolName(name) {
  return String(name || '')
    .replace('University of California, ', 'UC ')
    .replace('The University of Texas at ', 'UT ')
    .replace('University of Washington', 'UW')
    .replace('Washington State University', 'WSU')
    .replace('Massachusetts Institute of Technology', 'MIT')
    .replace('University of Southern California', 'USC')
    .replace('University of Michigan', 'UMich')
    .replace(' University', '');
}

function inferDimensions(text) {
  const t = ` ${String(text).toLowerCase()} `;
  const hits = [];
  for (const [dim, kws] of Object.entries(DIM_KEYWORDS)) {
    if (kws.some((k) => t.includes(k))) hits.push(dim);
  }
  return hits.length ? hits : null;
}

function textRelatesToInsight(text, insightKey) {
  const dims = inferDimensions(text);
  if (dims && dims.includes(insightKey)) return true;
  return false;
}

function scoreTextColor(score) {
  if (score >= 7.0) return TEAL;
  if (score >= 4.0) return AMBER;
  return RED;
}

function scoreFillRgb(score) {
  if (score >= 7.0) return { r: 13, g: 148, b: 136 };
  if (score >= 4.0) return { r: 217, g: 119, b: 6 };
  return { r: 220, g: 38, b: 38 };
}

function cellRect(doc, x, y, w, h, fillColor, strokeColor = '#e5e7eb') {
  doc.save();
  doc.fillColor(fillColor).rect(x, y, w, h).fill();
  doc.strokeColor(strokeColor).lineWidth(0.35).rect(x, y, w, h).stroke();
  doc.restore();
}

function drawScoreFillRect(doc, x, y, w, h, score) {
  const { r, g, b } = scoreFillRgb(score);
  doc.save();
  doc.opacity(0.1);
  doc.rect(x, y, w, h).fill(`rgb(${r},${g},${b})`);
  doc.restore();
}

function formatScore(score) {
  const n = typeof score === 'number' ? score : 0;
  return (Math.round(n * 10) / 10).toFixed(1);
}

function bandLabel(band) {
  const b = String(band || '').toLowerCase();
  if (b === 'reach') return 'REACH';
  if (b === 'safety') return 'SAFETY';
  return 'TARGET';
}

function overallAssessmentSentence(evaluations) {
  const reachNames = evaluations
    .filter((e) => String(e.band || '').toLowerCase() === 'reach')
    .map((e) => e.university)
    .filter(Boolean);
  if (reachNames.length === 0) {
    return 'This student is competitive across their target schools.';
  }
  const list = reachNames.join(', ');
  return `This student faces selective admissions at ${list} — strategic improvement in key dimensions could strengthen their positioning.`;
}

function dimensionAverages(evaluations) {
  const out = {};
  for (const { field, insight } of DIMENSION_ROWS) {
    let sum = 0;
    for (const e of evaluations) {
      sum += typeof e[field] === 'number' ? e[field] : 0;
    }
    out[insight] = evaluations.length ? sum / evaluations.length : 0;
  }
  return out;
}

/**
 * Collect unique weaknesses in stable order across all evaluations.
 * @param {object[]} evaluations
 * @returns {string[]}
 */
function collectAllWeaknesses(evaluations) {
  const seen = new Set();
  const out = [];
  for (const ev of evaluations) {
    for (const w of ev.weaknesses || []) {
      if (typeof w !== 'string' || !w.trim()) continue;
      const t = w.trim();
      if (seen.has(t)) continue;
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

/**
 * Assign each dimension at most one weakness; each weakness at most one dimension.
 * @param {string[]} weaknesses
 * @param {{ key: string }[]} dimensions - ordered (e.g. lowest avg first)
 * @returns {Record<string, string>}
 */
function matchWeaknessToDimension(weaknesses, dimensions) {
  const results = {};
  const used = new Set();

  for (const dim of dimensions) {
    const keywords = DIM_KEYWORDS[dim.key] || [];
    let bestMatch = null;

    for (const w of weaknesses) {
      if (used.has(w)) continue;
      const text = w.toLowerCase();
      if (keywords.some((k) => text.includes(String(k).toLowerCase()))) {
        bestMatch = w;
        break;
      }
    }

    if (!bestMatch) {
      for (const w of weaknesses) {
        if (!used.has(w)) {
          bestMatch = w;
          break;
        }
      }
    }

    if (bestMatch) {
      results[dim.key] = bestMatch;
      used.add(bestMatch);
    }
  }

  return results;
}

function impactLevel(avg) {
  const gap = 7.0 - avg;
  if (gap > 3) return 'High';
  if (gap >= 1.5) return 'Medium';
  return 'Low';
}

function insightLabel(insight) {
  const row = DIMENSION_ROWS.find((d) => d.insight === insight);
  return row ? row.label : insight;
}

function pickStrengthForInsight(ev, insightKey) {
  const list = (ev.strengths || []).filter((s) => typeof s === 'string');
  for (const s of list) {
    if (textRelatesToInsight(s, insightKey)) return s;
  }
  return list[0] || '—';
}

function pickWeaknessForInsight(ev, insightKey) {
  const list = (ev.weaknesses || []).filter((s) => typeof s === 'string');
  for (const w of list) {
    if (textRelatesToInsight(w, insightKey)) return w;
  }
  return list[0] || '—';
}

function dimensionWithLargestSpread(evaluations) {
  let best = null;
  for (const { field, label } of DIMENSION_ROWS) {
    const scores = evaluations.map((e) => (typeof e[field] === 'number' ? e[field] : 0));
    const min = Math.min(...scores);
    const max = Math.max(...scores);
    const spread = max - min;
    if (spread >= 2 && (!best || spread > best.spread)) {
      const minIdx = scores.indexOf(min);
      const maxIdx = scores.indexOf(max);
      best = {
        label,
        min,
        max,
        spread,
        minSchool: evaluations[minIdx]?.university || 'School',
        maxSchool: evaluations[maxIdx]?.university || 'School',
      };
    }
  }
  return best;
}

function patternsBullets(evaluations) {
  const bullets = [];
  const avgs = dimensionAverages(evaluations);
  const entries = Object.entries(avgs);
  if (entries.length === 0) return bullets;

  const sortedHigh = [...entries].sort((a, b) => b[1] - a[1]);
  const sortedLow = [...entries].sort((a, b) => a[1] - b[1]);
  const [hiKey, hiVal] = sortedHigh[0];
  const [loKey, loVal] = sortedLow[0];
  bullets.push(`Strongest dimension: ${insightLabel(hiKey)} (avg ${formatScore(hiVal)})`);
  bullets.push(`Largest gap: ${insightLabel(loKey)} (avg ${formatScore(loVal)})`);

  const bestVar = dimensionWithLargestSpread(evaluations);
  if (bestVar) {
    bullets.push(
      `Note: ${bestVar.label} varies significantly across schools (${formatScore(bestVar.min)} at ${bestVar.minSchool} vs ${formatScore(bestVar.max)} at ${bestVar.maxSchool}) — consider school-specific essay tailoring.`
    );
  }
  return bullets.slice(0, 3);
}

function formatProfileGpa(p) {
  const g = p.gpa;
  if (g == null || g === '') return 'GPA: Not provided';
  const num = typeof g === 'number' ? g : Number(g);
  if (Number.isNaN(num) || num === 0) return 'GPA: Not provided';
  return `GPA: ${formatScore(num)}`;
}

function formatProfileMajor(p) {
  const m = p.intendedMajor;
  if (m == null || String(m).trim() === '' || String(m).trim().toLowerCase() === 'not specified') {
    return 'Intended major: Not provided';
  }
  return `Intended major: ${String(m).trim()}`;
}

function profileSnapshotEmpty(p) {
  const ac = p.activitiesCount ?? 0;
  const lr = p.leadershipRoles ?? 0;
  const hc = p.honorsCount ?? 0;
  return ac === 0 && lr === 0 && hc === 0;
}

function drawPage1(doc, data) {
  let y = MARGIN;
  doc.save();
  doc.font('Helvetica-Bold').fontSize(10).fillColor(CORAL);
  doc.text('ADMITLY', MARGIN, y, { width: CONTENT_W * 0.45, align: 'left', characterSpacing: 1.2 });
  doc.font('Helvetica-Bold').fontSize(14).fillColor(NAVY);
  doc.text('Counselor Summary', MARGIN, y, { width: CONTENT_W, align: 'right' });
  doc.restore();
  y += SECTION_GAP;
  doc.font('Helvetica').fontSize(10).fillColor(NAVY);
  doc.text(data.generatedDate || '', MARGIN, y, { width: CONTENT_W, align: 'right' });
  y += SECTION_GAP + 2;
  doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).lineWidth(1).strokeColor(CORAL).stroke();
  doc.strokeColor(NAVY);
  y += SECTION_GAP;

  doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY);
  doc.text('Student Profile', MARGIN, y);
  y += ITEM_GAP + 6;
  const displayName = data.studentName || 'Student';
  doc.font('Helvetica-Bold').fontSize(16).fillColor(NAVY);
  doc.text(displayName, MARGIN, y, { width: CONTENT_W });
  y += doc.heightOfString(displayName, { width: CONTENT_W }) + ITEM_GAP;
  doc.font('Helvetica').fontSize(10).fillColor(NAVY);
  const p = data.profile || {};

  doc.text(formatProfileGpa(p), MARGIN, y, { width: CONTENT_W });
  y += ITEM_GAP + 4;
  doc.text(formatProfileMajor(p), MARGIN, y, { width: CONTENT_W });
  y += ITEM_GAP + 4;

  const apTaken = p.apCoursesTaken ?? 0;
  const apAvail = p.apCoursesAvailable ?? 0;
  if (!(apTaken === 0 && apAvail === 0)) {
    doc.text(`AP courses: ${apTaken} taken / ${apAvail} available`, MARGIN, y, { width: CONTENT_W });
    y += ITEM_GAP + 4;
  }
  if (typeof p.satScore === 'number' && p.satScore > 0) {
    doc.text(`SAT: ${p.satScore}`, MARGIN, y, { width: CONTENT_W });
    y += ITEM_GAP + 4;
  }
  if (typeof p.actScore === 'number' && p.actScore > 0) {
    doc.text(`ACT: ${p.actScore}`, MARGIN, y, { width: CONTENT_W });
    y += ITEM_GAP + 4;
  }

  y += SECTION_GAP - ITEM_GAP;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY);
  doc.text('Application Snapshot', MARGIN, y);
  y += ITEM_GAP + 6;
  doc.font('Helvetica').fontSize(10).fillColor(NAVY);
  if (profileSnapshotEmpty(p)) {
    doc.text(
      'Profile details not available for this evaluation. Run a new evaluation to include full profile data in the PDF.',
      MARGIN,
      y,
      { width: CONTENT_W }
    );
    y += doc.heightOfString(
      'Profile details not available for this evaluation. Run a new evaluation to include full profile data in the PDF.',
      { width: CONTENT_W }
    );
  } else {
    doc.text(
      `Activities: ${p.activitiesCount ?? 0} · Leadership roles: ${p.leadershipRoles ?? 0} · Honors: ${p.honorsCount ?? 0}`,
      MARGIN,
      y,
      { width: CONTENT_W }
    );
    y += ITEM_GAP + 14;
  }

  y += SECTION_GAP - 4;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY);
  doc.text('Schools Evaluated', MARGIN, y);
  y += ITEM_GAP + 6;
  for (const ev of data.evaluations || []) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY);
    doc.text(ev.university || 'School', MARGIN, y, { width: CONTENT_W - 100 });
    const align = typeof ev.alignmentScore === 'number' ? formatScore(ev.alignmentScore) : '—';
    doc.font('Helvetica-Bold').fontSize(10).fillColor(scoreTextColor(ev.alignmentScore));
    doc.text(`${align}/10`, MARGIN + CONTENT_W - 90, y, { width: 90, align: 'right' });
    y += ITEM_GAP + 2;
    doc.font('Helvetica').fontSize(9).fillColor(NAVY);
    doc.text(bandLabel(ev.band), MARGIN, y, { characterSpacing: 0.8 });
    y += ITEM_GAP + 8;
  }

  y += SECTION_GAP - ITEM_GAP;
  doc.font('Helvetica-Bold').fontSize(12).fillColor(NAVY);
  doc.text('Overall Assessment', MARGIN, y);
  y += ITEM_GAP + 6;
  doc.font('Helvetica').fontSize(10).fillColor(NAVY);
  const assess = overallAssessmentSentence(data.evaluations || []);
  doc.text(assess, MARGIN, y, { width: CONTENT_W, align: 'left' });
}

function drawSingleSchoolDetail(doc, ev) {
  let y = MARGIN;
  doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY);
  const title = `Detailed Evaluation: ${ev.university || 'School'}`;
  doc.text(title, MARGIN, y, { width: CONTENT_W });
  y += SECTION_GAP + 8;

  for (const { field, insight, label } of DIMENSION_ROWS) {
    const score = ev[field];
    const sc = typeof score === 'number' ? score : 0;
    doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY);
    doc.text(label, MARGIN, y, { width: CONTENT_W });
    y += ITEM_GAP + 2;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(scoreTextColor(sc));
    doc.text(`${formatScore(sc)}/10`, MARGIN, y);
    const barX = MARGIN + 72;
    const barW = 130;
    const barH = 7;
    const fillW = (Math.max(0, Math.min(10, sc)) / 10) * barW;
    doc.save();
    doc.fillColor('#e5e7eb').rect(barX, y - 1, barW, barH).fill();
    doc.fillColor(scoreTextColor(sc)).rect(barX, y - 1, fillW, barH).fill();
    doc.strokeColor('#d1d5db').lineWidth(0.5).rect(barX, y - 1, barW, barH).stroke();
    doc.restore();
    y += ITEM_GAP + 10;
    doc.font('Helvetica').fontSize(9).fillColor(NAVY);
    doc.text(`Strength: ${pickStrengthForInsight(ev, insight)}`, MARGIN + 8, y, { width: CONTENT_W - 8 });
    y += ITEM_GAP + 4;
    doc.text(`Weakness: ${pickWeaknessForInsight(ev, insight)}`, MARGIN + 8, y, { width: CONTENT_W - 8 });
    y += SECTION_GAP - 2;
  }

  doc.font('Helvetica-Bold').fontSize(9).fillColor(NAVY);
  doc.text('Alignment Score', MARGIN, y);
  doc.font('Helvetica-Bold').fontSize(10).fillColor(scoreTextColor(ev.alignmentScore));
  doc.text(`${formatScore(ev.alignmentScore)}/10`, MARGIN + 100, y);
  const barX = MARGIN + 180;
  const barW = 130;
  const barH = 7;
  const sc = typeof ev.alignmentScore === 'number' ? ev.alignmentScore : 0;
  const fillW = (Math.max(0, Math.min(10, sc)) / 10) * barW;
  doc.save();
  doc.fillColor('#e5e7eb').rect(barX, y - 1, barW, barH).fill();
  doc.fillColor(scoreTextColor(sc)).rect(barX, y - 1, fillW, barH).fill();
  doc.strokeColor('#d1d5db').lineWidth(0.5).rect(barX, y - 1, barW, barH).stroke();
  doc.restore();
}

function drawComparisonTable(doc, evaluations) {
  let y = MARGIN;
  doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY);
  doc.text('Cross-School Comparison', MARGIN, y, { width: CONTENT_W });
  y += SECTION_GAP + 4;

  const schools = evaluations.map((e) => e.university || 'School');
  const dimColW = 108;
  const n = schools.length;
  const cellW = (CONTENT_W - dimColW) / n;

  let x = MARGIN;
  doc.font('Helvetica-Bold').fontSize(8).fillColor(NAVY);
  cellRect(doc, x, y, dimColW, TABLE_HEADER_H, ROW_GRAY);
  doc.text('Dimension', x + 4, y + 8, { width: dimColW - 8 });
  x += dimColW;
  for (let i = 0; i < n; i++) {
    const alt = i % 2 === 0 ? ROW_GRAY : '#ffffff';
    cellRect(doc, x, y, cellW, TABLE_HEADER_H, alt);
    doc.fillColor(NAVY);
    const abbr = abbreviateSchoolName(schools[i]);
    doc.font('Helvetica-Bold').fontSize(8);
    doc.text(abbr, x + 2, y + 7, { width: cellW - 4, align: 'center' });
    x += cellW;
  }
  y += TABLE_HEADER_H;

  const rows = [
    ...DIMENSION_ROWS.map((d) => ({ label: d.label, field: d.field, bold: false })),
    { label: 'Alignment Score', field: 'alignmentScore', bold: true },
  ];

  let rowIdx = 0;
  for (const row of rows) {
    x = MARGIN;
    const bg = rowIdx % 2 === 0 ? '#ffffff' : ROW_GRAY;
    cellRect(doc, x, y, dimColW, TABLE_ROW_H, bg);
    doc.fillColor(NAVY);
    doc.font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    doc.text(row.label, x + 4, y + 8, { width: dimColW - 8 });
    x += dimColW;
    for (let i = 0; i < n; i++) {
      const ev = evaluations[i];
      const score = typeof ev[row.field] === 'number' ? ev[row.field] : 0;
      drawScoreFillRect(doc, x, y, cellW, TABLE_ROW_H, score);
      doc.rect(x, y, cellW, TABLE_ROW_H).strokeColor('#e5e7eb').lineWidth(0.3).stroke();
      doc.font(row.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).fillColor(scoreTextColor(score));
      doc.text(formatScore(score), x, y + 8, { width: cellW, align: 'center' });
      x += cellW;
    }
    y += TABLE_ROW_H;
    rowIdx += 1;
  }

  y += PATTERNS_AFTER_TABLE_GAP;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY);
  doc.text('Patterns', MARGIN, y);
  y += ITEM_GAP + 6;
  doc.font('Helvetica').fontSize(9).fillColor(NAVY);
  for (const b of patternsBullets(evaluations)) {
    doc.fillColor(NAVY).circle(MARGIN + 3, y + 3, 1.5).fill();
    doc.fillColor(NAVY).font('Helvetica').fontSize(9);
    doc.text(b, MARGIN + 10, y, { width: CONTENT_W - 10, align: 'left' });
    y += doc.heightOfString(b, { width: CONTENT_W - 10 }) + ITEM_GAP;
  }
}

function drawPage3(doc, data) {
  let y = MARGIN;
  doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY);
  doc.text('Strategic Priorities', MARGIN, y, { width: CONTENT_W });
  y += SECTION_GAP + 4;

  const evaluations = data.evaluations || [];
  const avgs = dimensionAverages(evaluations);
  const sortedGaps = Object.entries(avgs).sort((a, b) => a[1] - b[1]);
  const top3 = sortedGaps.slice(0, 3);
  const weaknessPool = collectAllWeaknesses(evaluations);
  const dimKeysOrdered = top3.map(([insight]) => ({ key: insight }));
  const weakByDim = matchWeaknessToDimension(weaknessPool, dimKeysOrdered);

  for (const [insight, avg] of top3) {
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY);
    doc.text(`${insightLabel(insight)} — avg ${formatScore(avg)}/10`, MARGIN, y);
    y += ITEM_GAP + 6;
    doc.font('Helvetica').fontSize(9).fillColor(NAVY);
    doc.text(`Impact: ${impactLevel(avg)}`, MARGIN, y);
    y += ITEM_GAP + 4;
    const weak = weakByDim[insight] || 'Review evaluation weaknesses for this dimension.';
    const weakLine = `Top weakness: ${weak}`;
    doc.text(weakLine, MARGIN, y, { width: CONTENT_W });
    y += doc.heightOfString(weakLine, { width: CONTENT_W }) + PRIORITY_BLOCK_GAP;
  }

  y += ITEM_GAP;
  const strongDims = Object.entries(avgs).filter(([, v]) => v >= 7.0);
  if (strongDims.length > 0) {
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY);
    doc.text('Already Strong — Protect These', MARGIN, y);
    y += ITEM_GAP + 6;
    doc.font('Helvetica').fontSize(9).fillColor(TEAL);
    for (const [k, v] of strongDims) {
      doc.text(`${insightLabel(k)}: ${formatScore(v)}/10 avg`, MARGIN, y, { width: CONTENT_W });
      y += ITEM_GAP + 6;
    }
  }

  const essays = data.essayAnalyses || [];
  if (essays.length > 0) {
    y += SECTION_GAP - ITEM_GAP;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(NAVY);
    doc.text('Essay Performance by School', MARGIN, y);
    y += ITEM_GAP + 8;

    const colSchool = 120;
    const colNum = 48;
    const tableW = CONTENT_W;
    const essayRowH = 22;
    let x = MARGIN;
    doc.font('Helvetica-Bold').fontSize(7).fillColor(NAVY);
    cellRect(doc, x, y, colSchool, essayRowH, ROW_GRAY);
    doc.text('School', x + 3, y + 7, { width: colSchool - 6 });
    x += colSchool;
    for (const h of ['Strategic', 'Content', 'Structure', 'Verdict']) {
      const w = h === 'Verdict' ? tableW - colSchool - 3 * colNum : colNum;
      cellRect(doc, x, y, w, essayRowH, ROW_GRAY);
      doc.text(h, x + 2, y + 7, { width: w - 4, align: 'center' });
      x += w;
    }
    y += essayRowH;

    for (const ea of essays) {
      const verdict = String(ea.overallVerdict || '').slice(0, 100);
      x = MARGIN;
      doc.font('Helvetica').fontSize(7).fillColor(NAVY);
      cellRect(doc, x, y, colSchool, essayRowH, '#ffffff');
      doc.text((ea.university || '—').slice(0, 26), x + 3, y + 6, { width: colSchool - 6 });
      x += colSchool;
      const nums = [
        typeof ea.strategicFit === 'number' ? formatScore(ea.strategicFit) : '—',
        typeof ea.contentAnalysis === 'number' ? formatScore(ea.contentAnalysis) : '—',
        typeof ea.structureAndVoice === 'number' ? formatScore(ea.structureAndVoice) : '—',
      ];
      for (const num of nums) {
        cellRect(doc, x, y, colNum, essayRowH, '#ffffff');
        doc.text(num, x, y + 7, { width: colNum, align: 'center' });
        x += colNum;
      }
      const vw = tableW - colSchool - 3 * colNum;
      cellRect(doc, x, y, vw, essayRowH, '#ffffff');
      doc.text(verdict || '—', x + 3, y + 5, { width: vw - 6 });
      y += essayRowH;
    }
  }
}

/**
 * Page 4+ : discussion guide; may add pages if content is long.
 */
function drawPage4(doc, data) {
  let y = MARGIN;

  function needPageBreak(needed) {
    if (y + needed <= CONTENT_MAX_Y) return;
    doc.addPage();
    y = MARGIN;
  }

  doc.font('Helvetica-Bold').fontSize(13).fillColor(NAVY);
  needPageBreak(28);
  doc.text('Discussion Guide for Counselor Meeting', MARGIN, y, { width: CONTENT_W });
  y += SECTION_GAP;

  const sub =
    'The following questions are generated from this student\'s specific evaluation data. Each references a concrete data point from their profile.';
  doc.font('Helvetica').fontSize(9).fillColor(NAVY);
  const subH = doc.heightOfString(sub, { width: CONTENT_W });
  needPageBreak(subH + 10);
  doc.text(sub, MARGIN, y, { width: CONTENT_W });
  y += subH + SECTION_GAP - 4;

  const guide = data.discussionGuide || [];
  if (guide.length === 0) {
    const fallback =
      'Discussion guide could not be generated. Use the comparison matrix and priority actions above as meeting talking points.';
    doc.font('Helvetica').fontSize(9).fillColor(NAVY);
    const fbH = doc.heightOfString(fallback, { width: CONTENT_W });
    needPageBreak(fbH + 6);
    doc.text(fallback, MARGIN, y, { width: CONTENT_W });
    return;
  }

  guide.forEach((item, idx) => {
    const q = `${idx + 1}. ${item.question || ''}`;
    doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY);
    const qH = doc.heightOfString(q, { width: CONTENT_W });
    const c = `Context: ${item.context || ''}`;
    doc.font('Helvetica').fontSize(9).fillColor(NAVY);
    const cH = doc.heightOfString(c, { width: CONTENT_W });
    const d = `Based on: ${item.dataPoint || ''}`;
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED);
    const dH = doc.heightOfString(d, { width: CONTENT_W });
    const block = qH + cH + dH + ITEM_GAP * 3 + 6;
    needPageBreak(block);

    doc.font('Helvetica-Bold').fontSize(10).fillColor(NAVY);
    doc.text(q, MARGIN, y, { width: CONTENT_W });
    y += qH + ITEM_GAP - 2;
    doc.font('Helvetica').fontSize(9).fillColor(NAVY);
    doc.text(c, MARGIN, y, { width: CONTENT_W });
    y += cH + ITEM_GAP - 2;
    doc.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED);
    doc.text(d, MARGIN, y, { width: CONTENT_W });
    y += dH + PRIORITY_BLOCK_GAP;
  });
}

function applyFootersToAllPages(doc) {
  const range = doc.bufferedPageRange();
  const total = range.count;
  for (let i = 0; i < total; i++) {
    doc.switchToPage(range.start + i);
    doc.save();
    doc.font('Helvetica').fontSize(8).fillColor('#9ca3af');
    doc.text('Generated by Admitly | useadmitly.com', MARGIN, FOOTER_TEXT_Y, {
      width: CONTENT_W * 0.55,
      lineBreak: false,
    });
    doc.text(`Page ${i + 1} of ${total}`, PAGE_W - MARGIN - 100, FOOTER_TEXT_Y, {
      width: 100,
      align: 'right',
      lineBreak: false,
    });
    doc.restore();
  }
}

/**
 * @param {object} data
 * @returns {Promise<Buffer>}
 */
function generateCounselorPDF(data) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const doc = new PDFDocument({
      bufferPages: true,
      size: 'LETTER',
      margin: MARGIN,
      autoFirstPage: true,
    });

    doc.on('data', (c) => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    try {
      drawPage1(doc, data);

      doc.addPage();
      const evs = data.evaluations || [];
      if (evs.length === 1) {
        drawSingleSchoolDetail(doc, evs[0]);
      } else {
        drawComparisonTable(doc, evs);
      }

      doc.addPage();
      drawPage3(doc, data);

      doc.addPage();
      drawPage4(doc, data);

      applyFootersToAllPages(doc);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

module.exports = {
  generateCounselorPDF,
};
