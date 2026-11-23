import { GROUP_THRESHOLD } from './organizationChartHybrid.ts';
import { memberRelationLabel, organizationRoleLabel } from './organizationChartGroups.ts';
import type { CrewMember, OrganizationGroups, SupervisorGroup } from './organizationChartGroups.ts';
export type PdfMode = 'chart' | 'list' | 'both';
type Page = { jpeg: Uint8Array; width: number; height: number; pixelsWide: number; pixelsHigh: number };

// Image pages preserve browser font rendering (including names outside Latin-1).
// Offsets are byte offsets, not JavaScript string lengths.
export function imagePagesPdf(pages: Page[]): Uint8Array {
    const encoder = new TextEncoder();
    const chunks: Uint8Array[] = [];
    let length = 0;
    const offsets = [0];
    const append = (value: string | Uint8Array) => { const bytes = typeof value === 'string' ? encoder.encode(value) : value; chunks.push(bytes); length += bytes.length; };
    const object = (id: number, body: () => void) => { offsets[id] = length; append(`${id} 0 obj\n`); body(); append('\nendobj\n'); };
    append('%PDF-1.4\n');
    object(1, () => append('<< /Type /Catalog /Pages 2 0 R >>'));
    object(2, () => append(`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`));
    pages.forEach((page, index) => {
        const id = 3 + index * 3;
        object(id, () => append(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Resources << /XObject << /Image ${id + 1} 0 R >> >> /Contents ${id + 2} 0 R >>`));
        object(id + 1, () => {
            append(`<< /Type /XObject /Subtype /Image /Width ${page.pixelsWide} /Height ${page.pixelsHigh} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.jpeg.length} >>\nstream\n`);
            append(page.jpeg); append('\nendstream');
        });
        const stream = `q ${page.width} 0 0 ${page.height} 0 0 cm /Image Do Q\n`;
        object(id + 2, () => append(`<< /Length ${encoder.encode(stream).length} >>\nstream\n${stream}endstream`));
    });
    const xref = length;
    append(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);
    offsets.slice(1).forEach((offset) => append(`${String(offset).padStart(10, '0')} 00000 n \n`));
    append(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const result = new Uint8Array(length);
    let cursor = 0;
    chunks.forEach((chunk) => { result.set(chunk, cursor); cursor += chunk.length; });
    return result;
}

function pageCanvas(width: number, height: number) {
    const scale = Math.min(2, 8192 / Math.max(width, height), Math.sqrt(24_000_000 / (width * height)));
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Browser tidak mendukung ekspor PDF.');
    context.scale(scale, scale);
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, width, height);
    return { canvas, context };
}

async function finishPage(canvas: HTMLCanvasElement, width: number, height: number): Promise<Page> {
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Halaman PDF gagal dibuat.')), 'image/jpeg', 0.95));
    const jpeg = new Uint8Array(await blob.arrayBuffer());
    const pageScale = Math.min(1, 14400 / Math.max(width, height));
    const page = { jpeg, width: width * pageScale, height: height * pageScale, pixelsWide: canvas.width, pixelsHigh: canvas.height };
    canvas.width = 0; canvas.height = 0;
    return page;
}

function wrappedLines(ctx: CanvasRenderingContext2D, value: string, width: number, font: string) {
    ctx.font = font;
    const lines: string[] = [];
    let line = '';
    for (const char of value) {
        if (line && ctx.measureText(line + char).width > width) { lines.push(line); line = ''; }
        line += char;
    }
    lines.push(line);
    return lines;
}

function text(ctx: CanvasRenderingContext2D, value: string, x: number, y: number, width: number, font = '12px Arial', color = '#172033', maxLines = Infinity) {
    const lines = wrappedLines(ctx, value, width, font);
    ctx.fillStyle = color;
    if (lines.length > maxLines) {
        lines.length = maxLines;
        let last = lines[maxLines - 1];
        while (last && ctx.measureText(last + '...').width > width) last = last.slice(0, -1);
        lines[maxLines - 1] = last + '...';
    }
    const lineHeight = parseFloat(font.replace(/^bold /, '')) * 1.3;
    lines.forEach((part, i) => ctx.fillText(part, x, y + i * lineHeight));
    return lines.length * lineHeight;
}

async function starPages(groups: SupervisorGroup[], title: string): Promise<Page[]> {
    const pages: Page[] = [];
    for (const group of groups) {
        const width = 842, height = 595, sheet = pageCanvas(width, height), ctx = sheet.context;
        text(ctx, 'Organigram Karyawan', 28, 30, width - 56, 'bold 17px Arial');
        text(ctx, title, 28, 51, width - 56, '10px Arial');
        let y = 76;
        group.paths.forEach(path => { y += text(ctx, path.map(person => `${organizationRoleLabel(person)}: ${person.name} (${person.username})`).join(' > '), 230, y, 380, '10px Arial', '#64748b') + 5; });
        const draw = (x: number, top: number, name: string, nik: string, detail: string, color = '#7444d4') => {
            ctx.fillStyle = '#faf7ff'; ctx.strokeStyle = color; ctx.beginPath(); ctx.roundRect(x, top, 210, 82, 8); ctx.fill(); ctx.stroke();
            text(ctx, name, x + 10, top + 17, 190, 'bold 11px Arial', '#172033', 2);
            text(ctx, nik, x + 10, top + 46, 190, '10px Arial', color, 1);
            text(ctx, detail, x + 10, top + 62, 190, '9px Arial', '#64748b', 1);
        };
        const hub = { x: 316, y: 290 };
        group.members.forEach((member, index) => {
            const x = index % 2 ? 604 : 28, top = 135 + Math.floor(index / 2) * 106;
            if (!member.inactive) {
                ctx.strokeStyle = member.backup ? '#d97706' : '#7444d4'; ctx.setLineDash(member.backup ? [5, 4] : []);
                ctx.beginPath(); ctx.moveTo(index % 2 ? hub.x + 210 : hub.x, hub.y + 41); ctx.lineTo(index % 2 ? x : x + 210, top + 41); ctx.stroke(); ctx.setLineDash([]);
            }
            draw(x, top, member.person.name, member.person.username, member.inactive ? 'Relasi nonaktif' : member.person.job_level_name || member.person.tier_label, member.inactive ? '#94a3b8' : member.backup ? '#d97706' : '#7444d4');
        });
        if (group.paths.length) { ctx.strokeStyle = '#7444d4'; ctx.beginPath(); ctx.moveTo(width / 2, y + 5); ctx.lineTo(width / 2, hub.y); ctx.stroke(); }
        draw(hub.x, hub.y, group.supervisor.name, group.supervisor.username, 'Supervisor');
        text(ctx, `${group.members.length} SC | garis putus-putus: backup | tanpa garis: nonaktif`, 28, height - 20, width - 56, '9px Arial', '#64748b');
        pages.push(await finishPage(sheet.canvas, width, height));
    }
    return pages;
}

async function groupedPages(organization: OrganizationGroups, title: string, chart: boolean): Promise<Page[]> {
    const sections: { heading: string; context: string[]; detail?: string; label: string; members: CrewMember[] }[] = organization.groups.map((group) => ({
        heading: `Supervisor: ${group.supervisor.name} (${group.supervisor.username})`,
        detail: `${group.supervisor.job_level_name || group.supervisor.tier_label} | ${group.supervisor.division_name || '-'}`,
        context: group.paths.map((path) => path.map((person) => `${organizationRoleLabel(person)}: ${person.name} (${person.username}) | ${person.job_level_name || organizationRoleLabel(person)} | ${person.division_name || '-'}`).join(' > ')),
        label: `${group.members.length} Service Crew (${group.members.filter(member => !member.inactive).length} aktif, ${group.members.filter(member => member.inactive).length} nonaktif)`, members: [...group.members].sort((a, b) => Number(a.inactive) - Number(b.inactive)),
    }));
    if (chart) {
        const split = sections.flatMap(section => {
            const active = section.members.filter(member => !member.inactive), inactive = section.members.filter(member => member.inactive);
            return [
                ...(active.length || !inactive.length ? [{ ...section, label: `Di dalam kelompok - ${active.length} SC aktif`, members: active }] : []),
                ...(inactive.length ? [{ ...section, label: `Di luar kelompok - ${inactive.length} SC nonaktif`, members: inactive }] : []),
            ];
        });
        sections.splice(0, sections.length, ...split);
    }
    if (organization.unassigned.length) sections.push({ heading: 'SC tanpa supervisor pada tampilan ini', context: [], label: `${organization.unassigned.length} Service Crew`, members: organization.unassigned });
    if (organization.standaloneLeaders.length) sections.push({ heading: 'Pimpinan tanpa supervisor pada tampilan ini', context: [], label: `${organization.standaloneLeaders.length} pimpinan`, members: organization.standaloneLeaders.map((person) => ({ person, backup: false, inactive: false, otherLeaders: [] })) });
    const pages: Page[] = [];
    const width = chart ? 842 : 595, height = chart ? 595 : 842;
    let pageNumber = 0;
    for (const section of sections) {
        let sheet = pageCanvas(width, height);
        const header = () => {
            const ctx = sheet.context;
            text(ctx, chart ? 'Organigram Karyawan' : 'Daftar Anggota Organigram', 28, 32, width - 56, 'bold 17px Arial');
            let y = 56 + text(ctx, title, 28, 56, width - 56, '10px Arial');
            const connector = () => { ctx.beginPath(); ctx.strokeStyle = '#7444d4'; ctx.lineWidth = 2; ctx.moveTo(width / 2, y); ctx.lineTo(width / 2, y + 14); ctx.stroke(); y += 14; };
            for (const context of section.context) {
                if (chart) {
                    const boxHeight = wrappedLines(ctx, context, width - 80, '10px Arial').length * 13 + 16;
                    ctx.strokeStyle = '#ded4f1'; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(28, y, width - 56, boxHeight, 8); ctx.stroke();
                    text(ctx, context, 40, y + 17, width - 80, '10px Arial', '#64748b'); y += boxHeight; connector();
                } else y += text(ctx, context, 28, y + 6, width - 56, '10px Arial', '#64748b') + 8;
            }
            if (chart) {
                const boxHeight = wrappedLines(ctx, section.heading, width - 80, 'bold 13px Arial').length * 17 + 16 + (section.detail ? wrappedLines(ctx, section.detail, width - 80, '10px Arial').length * 13 + 4 : 0);
                ctx.fillStyle = '#faf7ff'; ctx.strokeStyle = '#ded4f1'; ctx.beginPath(); ctx.roundRect(28, y, width - 56, boxHeight, 8); ctx.fill(); ctx.stroke();
                const headingHeight = text(ctx, section.heading, 40, y + 19, width - 80, 'bold 13px Arial', '#5b21b6');
                if (section.detail) text(ctx, section.detail, 40, y + 19 + headingHeight + 3, width - 80, '10px Arial', '#64748b');
                y += boxHeight; if (section.members.some(member => !member.inactive)) connector(); else y += 14;
                ctx.strokeStyle = '#ded4f1'; ctx.beginPath(); ctx.roundRect(20, y, width - 40, height - 38 - y, 8); ctx.stroke();
                y += 20;
            } else {
                y += text(ctx, section.heading, 28, y + 8, width - 56, 'bold 13px Arial', '#5b21b6') + 16;
                if (section.detail) y += text(ctx, section.detail, 28, y + 8, width - 56, '10px Arial', '#64748b') + 16;
            }
            y += text(ctx, section.label, 28, y, width - 56, 'bold 11px Arial') + 15;
            text(ctx, `Halaman ${++pageNumber} | ${section.heading}`, 28, height - 18, width - 56, '9px Arial', '#64748b', 1);
            return y;
        };
        let y = header();
        const nextPage = async () => { pages.push(await finishPage(sheet.canvas, width, height)); sheet = pageCanvas(width, height); y = header(); };
        if (chart) {
            const columns = 3, gap = 12, cardWidth = (width - 56 - gap * (columns - 1)) / columns;
            for (let index = 0; index < section.members.length; index += columns) {
                const row = section.members.slice(index, index + columns);
                const fieldsFor = (member: CrewMember) => [
                    { value: member.person.name, font: 'bold 12px Arial', max: 3, color: '#172033' },
                    { value: member.person.username, font: '10px Arial', max: 2, color: '#7444d4' },
                    { value: member.person.job_level_name || member.person.tier_label, font: '10px Arial', max: 2, color: '#64748b' },
                    { value: member.person.division_name || '-', font: '10px Arial', max: 1, color: '#64748b' },
                    { value: [member.backup ? 'Backup aktif' : '', member.inactive ? 'Relasi nonaktif' : '', member.otherLeaders.length ? `${member.otherLeaders.length} atasan lainnya` : ''].filter(Boolean).join(' | '), font: '9px Arial', max: 2, color: '#b45309' },
                ].filter((field) => field.value);
                const rowHeight = Math.max(...row.map((member) => 22 + fieldsFor(member).reduce((sum, field) => sum + Math.min(field.max, wrappedLines(sheet.context, field.value, cardWidth - 24, field.font).length) * parseFloat(field.font.replace(/^bold /, '')) * 1.3 + 4, 0)));
                if (y + rowHeight > height - 38) await nextPage();
                row.forEach((member, column) => {
                    const ctx = sheet.context, x = 28 + column * (cardWidth + gap);
                    ctx.fillStyle = '#faf7ff'; ctx.strokeStyle = '#ded4f1'; ctx.lineWidth = 1;
                    ctx.beginPath(); ctx.roundRect(x, y, cardWidth, rowHeight, 8); ctx.fill(); ctx.stroke();
                    let cursor = y + 20;
                    fieldsFor(member).forEach((field) => { cursor += text(ctx, field.value, x + 12, cursor, cardWidth - 24, field.font, field.color, field.max) + 4; });
                });
                y += rowHeight + 12;
            }
        } else {
            for (const member of section.members) {
                const fields = [
                    { value: `${member.person.username} - ${member.person.name}`, font: 'bold 12px Arial', color: '#172033' },
                    { value: `${member.person.job_level_name || member.person.tier_label} | ${member.person.division_name || '-'}`, font: '10px Arial', color: '#64748b' },
                    { value: memberRelationLabel(member), font: '10px Arial', color: '#b45309' },
                ].filter((field) => field.value);
                const totalHeight = fields.reduce((sum, field) => sum + wrappedLines(sheet.context, field.value, width - 56, field.font).length * 16, 12);
                if (y + totalHeight > height - 38 && totalHeight < height - 240) await nextPage();
                for (const field of fields) for (const line of wrappedLines(sheet.context, field.value, width - 56, field.font)) {
                    if (y + 16 > height - 38) await nextPage();
                    text(sheet.context, line, 28, y + 12, width - 56, field.font, field.color); y += 16;
                }
                y += 12;
            }
        }
        if (!section.members.length) text(sheet.context, 'Belum ada SC pada kelompok ini.', 28, y + 15, width - 56);
        pages.push(await finishPage(sheet.canvas, width, height));
    }
    return pages;
}

export async function downloadOrganizationPdf(input: { mode: PdfMode; title: string; groups: OrganizationGroups }) {
    await document.fonts.ready;
    const pages: Page[] = [];
    if (input.mode !== 'list') {
        pages.push(...await starPages(input.groups.groups.filter(group => group.members.length <= GROUP_THRESHOLD), input.title));
        pages.push(...await groupedPages({ ...input.groups, groups: input.groups.groups.filter(group => group.members.length > GROUP_THRESHOLD) }, input.title, true));
    }
    if (input.mode !== 'chart') pages.push(...await groupedPages(input.groups, input.title, false));
    const bytes = imagePagesPdf(pages);
    const url = URL.createObjectURL(new Blob([bytes as BlobPart], { type: 'application/pdf' }));
    const link = document.createElement('a'); link.href = url;
    link.download = `organigram-${input.mode}-${input.title.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 100)}.pdf`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
