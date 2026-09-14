"""report_generator.py"""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    Image, KeepTogether, PageBreak, Paragraph, SimpleDocTemplate, Spacer,
    Table, TableStyle,
)

from config import settings

# Four outcomes need four colours. v1.x had two, so not_assessed and
# out_of_scope both printed in violation red — telling an inspector that a
# package the engine could not read, and a package outside the Rules
# altogether, were both breaches.
RESULT_STYLE = {
    "compliant":     (colors.HexColor("#1B5E20"), "Compliant"),
    "violation":     (colors.HexColor("#B71C1C"), "Violation"),
    "not_assessed":  (colors.HexColor("#E65100"), "Not assessed"),
    "out_of_scope":  (colors.HexColor("#37474F"), "Outside these Rules"),
}
VERDICT_STYLE = {
    "pass":         (colors.HexColor("#1B5E20"), "Pass"),
    "fail":         (colors.HexColor("#B71C1C"), "Fail"),
    "not_assessed": (colors.HexColor("#E65100"), "Not assessed"),
}


def build_findings_table(findings: list) -> Table:
    """Nineteen rows. Always nineteen. With the denominator stated."""
    styles = getSampleStyleSheet()
    cell = ParagraphStyle("cell", parent=styles["BodyText"], fontSize=8, leading=10)

    data = [["#", "Check", "Verdict", "Observed / Reason", "Requirement"]]
    row_colours = []
    for i, f in enumerate(findings, start=1):
        verdict = f.human_verdict or f.engine_verdict
        colour, label = VERDICT_STYLE[verdict]
        row_colours.append((i, colour))
        detail = f.observed or f.reason or ""
        if f.human_verdict:
            detail += (
                f"<br/><i>Overridden by inspector: {f.override_reason}. "
                f"Engine verdict was {f.engine_verdict}.</i>"
            )
        data.append([
            f.check_id,
            Paragraph(f.title, cell),
            label,
            Paragraph(detail, cell),
            Paragraph((f.required or "") + _ledger_note(f), cell),
        ])

    t = Table(data, colWidths=[16 * mm, 42 * mm, 20 * mm, 55 * mm, 45 * mm],
              repeatRows=1)
    style = [
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#ECEFF1")),
        ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
        ("FONTSIZE", (0, 0), (-1, -1), 8),
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("GRID", (0, 0), (-1, -1), 0.25, colors.HexColor("#B0BEC5")),
    ]
    for row, colour in row_colours:
        style.append(("TEXTCOLOR", (2, row), (2, row), colour))
        style.append(("FONTNAME", (2, row), (2, row), "Helvetica-Bold"))
    t.setStyle(TableStyle(style))
    return t


def _ledger_note(f) -> str:
    if not f.ledger_ref:
        return ""
    return (
        f'<br/><font size="7" color="#546E7A">Legal basis for this threshold is '
        f'ledger {f.ledger_ref}, not yet verified against the gazette.</font>'
    )


DISCLAIMER = (
    "This document is machine-generated from photographic evidence and from "
    "measurements recorded by the inspecting officer. It records observations "
    "under the Legal Metrology (Packaged Commodities) Rules 2011 as amended, "
    "the rule set applied being that in force on {rules_as_at}. Penalties "
    "under section 36 of the Legal Metrology Act 2009 stand as amended by the "
    "Jan Vishwas (Amendment of Provisions) Act 2026, in force from 1 May 2026; "
    "no monetary figure is stated here because the schedule has not been "
    "verified against the gazette (ledger L-12). "
    "Findings recorded as “not assessed” are not findings of "
    "compliance and must not be read as such. This document does not address "
    "requirements under the Food Safety and Standards Act 2006 or, where the "
    "package is a medical device, under the Medical Devices Rules 2017, both of "
    "which are administered by other authorities and are referred to them "
    "separately. It is not a determination of liability; that is for the "
    "adjudicating officer."
)


def verification_qr(inspection_id: int, chain_head: str) -> Path:
    """A resolvable https URL, and the audit chain head at time of generation.

    v1.x encoded "niyamnetra://verify/{id}" — a private URI scheme that no
    phone camera resolves and no browser opens, so the QR code did nothing.

    Unique uuid suffix per call: concurrent reports for the same inspection
    never clobber each other's QR file. OUT_DIR disk errors propagate as
    OSError so callers map them to 503, not 500.
    """
    import qrcode
    import uuid as _uuid
    url = (
        f"{settings.PUBLIC_BASE_URL.rstrip('/')}"
        f"/verify?inspection={inspection_id}&head={chain_head[:16]}"
    )
    img = qrcode.make(url)
    settings.OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = settings.OUT_DIR / f"qr_{inspection_id}_{_uuid.uuid4().hex[:8]}.png"
    img.save(out)
    return out


def generate_docx(inspection, scans, findings_by_scan, out_path: Path) -> Path:
    """The Word equivalent. Same content, same four outcomes, same disclaimer.

    v1.x imported and called generate_docx from routers/reports.py and never
    defined it anywhere — section 7 of that file stopped at 7.1. Every request
    for a Word report raised ImportError.
    """
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt, RGBColor

    doc = Document()
    doc.core_properties.title = f"NiyamNetra inspection {inspection.id}"

    h = doc.add_heading("Inspection Report", level=0)
    h.alignment = WD_ALIGN_PARAGRAPH.CENTER

    meta = doc.add_table(rows=0, cols=2)
    meta.style = "Light Grid Accent 1"
    for label, value in (
        ("Inspection", str(inspection.id)),
        ("Date", inspection.inspection_date.strftime("%d %B %Y")),
        ("Store", inspection.store.name),
        ("Inspector", inspection.inspector.full_name),
        ("Rules as at", inspection.scans[0].rules_as_at.strftime("%d %B %Y")
         if inspection.scans else "-"),
        ("Engine version", inspection.scans[0].engine_version
         if inspection.scans else "-"),
    ):
        row = meta.add_row().cells
        row[0].text, row[1].text = label, value

    for scan in scans:
        doc.add_heading(
            f"{scan.commodity_generic or 'Unidentified package'}"
            f"{f' — {scan.brand_name}' if scan.brand_name else ''}",
            level=1,
        )
        _colour, label = RESULT_STYLE[scan.overall_result]
        p = doc.add_paragraph()
        run = p.add_run(f"Result: {label}")
        run.bold = True
        run.font.color.rgb = RGBColor.from_string(
            {"compliant": "1B5E20", "violation": "B71C1C",
             "not_assessed": "E65100", "out_of_scope": "37474F"}[scan.overall_result]
        )
        rows = findings_by_scan[scan.id]
        # Denominator excludes CHK18 (the derived Section-36 tier); C5 — a package
        # scan reports "16 of 18", not "17 of 19". The table below still lists all rows.
        assessable_rows = [f for f in rows if f.check_id != "CHK18"]
        na = sum(1 for f in assessable_rows
                 if (f.human_verdict or f.engine_verdict) == "not_assessed")
        doc.add_paragraph(
            f"{len(assessable_rows) - na} of {len(assessable_rows)} checks assessed"
            + (f"; {na} could not be assessed on this evidence." if na else ".")
        )

        table = doc.add_table(rows=1, cols=4)
        table.style = "Light Grid Accent 1"
        for i, head in enumerate(("Check", "Verdict", "Observed / Reason", "Requirement")):
            table.rows[0].cells[i].text = head
        for f in rows:
            c = table.add_row().cells
            c[0].text = f"{f.check_id} {f.title}"
            c[1].text = VERDICT_STYLE[f.human_verdict or f.engine_verdict][1]
            c[2].text = f.observed or f.reason or ""
            c[3].text = f.required or ""

    doc.add_page_break()
    doc.add_heading("Notes and limitations", level=1)
    d = doc.add_paragraph(DISCLAIMER.format(
        rules_as_at=(inspection.scans[0].rules_as_at.strftime("%d %B %Y")
                     if inspection.scans else "the applicable date")
    ))
    d.runs[0].font.size = Pt(8)

    doc.save(out_path)
    return out_path


# ---------------------------------------------------------------------------
# Daily report — one document for an inspector's whole day. Synthesised for the
# /reports/today.docx and /reports/today.pdf endpoints (§8.2). Reuses the same
# four-colour scheme, the same findings table, and the same disclaimer as the
# per-inspection Word report above, so the two never diverge.
# ---------------------------------------------------------------------------
def generate_daily_pdf(inspector, report_date, blocks, chain_head: str,
                       out_path: Path, period_label: str | None = None) -> Path:
    """period_label (e.g. "03 Aug 2026 to 02 Sep 2026") switches the header to
    a range report; None keeps the single-day header. Backward compatible."""
    styles = getSampleStyleSheet()
    h1 = ParagraphStyle("dh1", parent=styles["Heading1"], fontSize=15)
    h2 = ParagraphStyle("dh2", parent=styles["Heading2"], fontSize=12)
    body = ParagraphStyle("dbody", parent=styles["BodyText"], fontSize=9, leading=12)
    small = ParagraphStyle("dsmall", parent=styles["BodyText"], fontSize=7,
                           leading=9, textColor=colors.HexColor("#546E7A"))

    _title = "NiyamNetra — Inspection Report"
    _date_line = period_label or f"Date: {report_date.strftime('%d %B %Y')}"
    story = [
        Paragraph(_title, h1),
        Paragraph(f"Inspector: {inspector.full_name} ({inspector.employee_id})", body),
        Paragraph(_date_line, body),
        Spacer(1, 6 * mm),
    ]
    if not blocks:
        story.append(Paragraph("No inspections recorded in this period.", body))

    for insp, scans, findings_by_scan in blocks:
        store_name = insp.store.name if insp.store else "-"
        story.append(Paragraph(f"Inspection {insp.id} — {store_name}", h2))
        story.append(Paragraph(
            f"Transaction: {insp.transaction_type or '-'}; geofence: "
            f"{insp.geofence_status or 'unknown'}; status: {insp.status}.", body))
        if not scans:
            if getattr(insp, "signature_status", None) == "refused":
                ref = _refusal_notes(insp)
                story.append(Paragraph(
                    f"<b>Refusal / Non-cooperation:</b> {ref['reason']} "
                    f"(Merchant signature: {ref['signature_status']})",
                    body,
                ))
            else:
                story.append(Paragraph("No packages scanned.", body))
        for scan in scans:
            rows = findings_by_scan.get(scan.id, [])
            label = RESULT_STYLE.get(
                scan.overall_result, (colors.black, scan.overall_result))[1]
            title = (f"{scan.commodity_generic or 'Unidentified package'}"
                     f"{f' — {scan.brand_name}' if scan.brand_name else ''}")
            # Denominator excludes CHK18; C5 — a package reports "16 of 18".
            assessable = [f for f in rows if f.check_id != "CHK18"]
            na = sum(1 for f in assessable
                     if (f.human_verdict or f.engine_verdict) == "not_assessed")
            story.append(Paragraph(f"<b>{title}</b> — {label}", body))
            story.append(Paragraph(
                f"{len(assessable) - na} of {len(assessable)} checks assessed"
                + (f"; {na} not assessed." if na else "."), small))
            if rows:
                story.append(build_findings_table(rows))
            story.append(Spacer(1, 4 * mm))
        story.append(PageBreak())

    story.append(Paragraph("Notes and limitations", h2))
    story.append(Paragraph(
        DISCLAIMER.format(rules_as_at=report_date.strftime("%d %B %Y")), small))
    if chain_head and blocks:
        story.append(Spacer(1, 4 * mm))
        story.append(Image(str(verification_qr(blocks[0][0].id, chain_head)),
                           width=28 * mm, height=28 * mm))

    SimpleDocTemplate(
        str(out_path), pagesize=A4,
        title=f"NiyamNetra report {period_label or report_date.isoformat()}",
    ).build(story)
    return out_path
def generate_daily_docx(inspector, report_date, blocks, chain_head: str,
                        out_path: Path, period_label: str | None = None) -> Path:
    """period_label switches to a range header; None keeps the daily header."""
    from docx import Document
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    from docx.shared import Pt, RGBColor

    _HEX = {"compliant": "1B5E20", "violation": "B71C1C",
            "not_assessed": "E65100", "out_of_scope": "37474F"}

    doc = Document()
    doc.core_properties.title = f"NiyamNetra report {period_label or report_date.isoformat()}"
    h = doc.add_heading("Inspection Report", level=0)
    h.alignment = WD_ALIGN_PARAGRAPH.CENTER

    meta = doc.add_table(rows=0, cols=2)
    meta.style = "Light Grid Accent 1"
    for label, value in (
        ("Inspector", f"{inspector.full_name} ({inspector.employee_id})"),
        ("Period" if period_label else "Date",
         period_label or report_date.strftime("%d %B %Y")),
        ("Inspections", str(len(blocks))),
    ):
        cells = meta.add_row().cells
        cells[0].text, cells[1].text = label, value

    if not blocks:
        doc.add_paragraph("No inspections recorded in this period.")

    for insp, scans, findings_by_scan in blocks:
        store_name = insp.store.name if insp.store else "-"
        doc.add_heading(f"Inspection {insp.id} — {store_name}", level=1)
        doc.add_paragraph(
            f"Transaction: {insp.transaction_type or '-'}; geofence: "
            f"{insp.geofence_status or 'unknown'}; status: {insp.status}."
        )
        if not scans:
            if getattr(insp, "signature_status", None) == "refused":
                ref = _refusal_notes(insp)
                p = doc.add_paragraph()
                r = p.add_run(f"Refusal / Non-cooperation: {ref['reason']} (Merchant signature: {ref['signature_status']})")
                r.bold = True
            else:
                doc.add_paragraph("No packages scanned.")
        for scan in scans:
            rows = findings_by_scan.get(scan.id, [])
            doc.add_heading(
                f"{scan.commodity_generic or 'Unidentified package'}"
                f"{f' — {scan.brand_name}' if scan.brand_name else ''}", level=2)
            label = RESULT_STYLE.get(
                scan.overall_result, (None, scan.overall_result))[1]
            p = doc.add_paragraph()
            run = p.add_run(f"Result: {label}")
            run.bold = True
            if scan.overall_result in _HEX:
                run.font.color.rgb = RGBColor.from_string(_HEX[scan.overall_result])
            assessable = [f for f in rows if f.check_id != "CHK18"]
            na = sum(1 for f in assessable
                     if (f.human_verdict or f.engine_verdict) == "not_assessed")
            doc.add_paragraph(
                f"{len(assessable) - na} of {len(assessable)} checks assessed"
                + (f"; {na} could not be assessed." if na else ".")
            )
            if rows:
                table = doc.add_table(rows=1, cols=4)
                table.style = "Light Grid Accent 1"
                for i, head in enumerate(
                        ("Check", "Verdict", "Observed / Reason", "Requirement")):
                    table.rows[0].cells[i].text = head
                for f in rows:
                    c = table.add_row().cells
                    c[0].text = f"{f.check_id} {f.title}"
                    c[1].text = VERDICT_STYLE[f.human_verdict or f.engine_verdict][1]
                    c[2].text = f.observed or f.reason or ""
                    c[3].text = f.required or ""

    doc.add_page_break()
    doc.add_heading("Notes and limitations", level=1)
    d = doc.add_paragraph(
        DISCLAIMER.format(rules_as_at=report_date.strftime("%d %B %Y")))
    d.runs[0].font.size = Pt(8)
    tail = doc.add_paragraph(
        f"Audit chain head at generation: {chain_head[:32] or 'EMPTY'}")
    tail.runs[0].font.size = Pt(7)
    doc.save(out_path)
    return out_path


# ---------------------------------------------------------------------------
# Spreadsheet exports — .xlsx and .csv. Reports are not only PDF/DOCX: the
# review team wants the findings as data they can sort, filter and pivot. Both
# formats share one flat row model (_daily_rows) so the columns never diverge
# between them or from the PDF/DOCX narrative above. One finding = one row.
# ---------------------------------------------------------------------------

_SPREADSHEET_COLUMNS = (
    "Inspection", "Inspection date", "Store", "Transaction", "Geofence",
    "Status", "Package", "Scan result", "Check", "Check title", "Verdict",
    "Observed / Reason", "Requirement", "Ledger ref", "Overridden",
)


def _verdict_label(f) -> str:
    return VERDICT_STYLE[f.human_verdict or f.engine_verdict][1]


def _refusal_notes(insp) -> dict:
    """Extract display fields from a refused inspection block.

    A refusal has no scans (merchant non-cooperation). All four document
    generators call this helper so the same text appears in PDF, DOCX, XLSX
    and CSV.
    """
    store_name = insp.store.name if getattr(insp, "store", None) else "-"
    reason = (insp.notes or "").strip() or "Merchant refused to cooperate (no reason given)."
    return {
        "store_name": store_name,
        "reason": reason,
        "signature_status": getattr(insp, "signature_status", "refused") or "refused",
        "date_str": insp.inspection_date.strftime("%Y-%m-%d") if insp.inspection_date else "-",
        "transaction_type": insp.transaction_type or "-",
        "geofence_status": insp.geofence_status or "unknown",
        "insp_status": insp.status,
    }


def _daily_rows(blocks) -> list[list]:
    """Flatten (inspection, scans, findings) day-blocks into one row per finding.

    A scan with no findings still yields a single row so a package that could
    not be read at all is not silently absent from the sheet.

    A refused inspection (no scans, signature_status='refused') yields a
    dedicated 'Refusal / Non-cooperation' row so the refusal is never silently
    absent from the spreadsheet or CSV export.
    """
    rows: list[list] = []
    for insp, scans, findings_by_scan in blocks:
        store_name = insp.store.name if insp.store else "-"
        date_str = insp.inspection_date.strftime("%Y-%m-%d")
        if not scans:
            if getattr(insp, "signature_status", None) == "refused":
                # Refusal row: always present so compliance officers see it.
                ref = _refusal_notes(insp)
                rows.append([
                    insp.id, ref["date_str"], ref["store_name"],
                    ref["transaction_type"], ref["geofence_status"], ref["insp_status"],
                    "Refusal / Non-cooperation",
                    f"REFUSED — {ref['reason']}",
                    "", "", "", "", "", "", "",
                ])
            else:
                rows.append([
                    insp.id, date_str, store_name, insp.transaction_type or "-",
                    insp.geofence_status or "unknown", insp.status,
                    "(no packages scanned)", "-", "", "", "", "", "", "", "",
                ])
            continue
        for scan in scans:
            package = (f"{scan.commodity_generic or 'Unidentified package'}"
                       f"{f' — {scan.brand_name}' if scan.brand_name else ''}")
            result_label = RESULT_STYLE.get(
                scan.overall_result, (None, scan.overall_result))[1]
            findings = findings_by_scan.get(scan.id, [])
            if not findings:
                rows.append([
                    insp.id, date_str, store_name, insp.transaction_type or "-",
                    insp.geofence_status or "unknown", insp.status,
                    package, result_label, "", "", "", "", "", "", "",
                ])
                continue
            for f in findings:
                overridden = ("yes" if f.human_verdict else "no")
                rows.append([
                    insp.id, date_str, store_name, insp.transaction_type or "-",
                    insp.geofence_status or "unknown", insp.status,
                    package, result_label,
                    f.check_id, f.title, _verdict_label(f),
                    f.observed or f.reason or "", f.required or "",
                    f.ledger_ref or "", overridden,
                ])
    return rows


def generate_daily_xlsx(inspector, report_date, blocks, chain_head: str,
                        out_path: Path, period_label: str | None = None) -> Path:
    """The spreadsheet equivalent of the daily report. Openpyxl, no macros.
    period_label switches the header to a range; None keeps the daily header."""
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter

    wb = Workbook()
    ws = wb.active
    ws.title = "Findings"

    # Header band: who / when / integrity, then a blank row, then the table.
    ws.append(["NiyamNetra — Inspection Report"])
    ws["A1"].font = Font(bold=True, size=14)
    ws.append([f"Inspector: {inspector.full_name} ({inspector.employee_id})"])
    ws.append([period_label or f"Date: {report_date.strftime('%d %B %Y')}"])
    ws.append([f"Inspections: {len(blocks)}"])
    ws.append([f"Audit chain head at generation: {chain_head[:32] or 'EMPTY'}"])
    ws.append([])

    header_row_idx = ws.max_row + 1
    ws.append(list(_SPREADSHEET_COLUMNS))
    head_fill = PatternFill("solid", fgColor="ECEFF1")
    for col in range(1, len(_SPREADSHEET_COLUMNS) + 1):
        c = ws.cell(row=header_row_idx, column=col)
        c.font = Font(bold=True)
        c.fill = head_fill

    for row in _daily_rows(blocks):
        ws.append(row)

    if ws.max_row == header_row_idx:
        ws.append(["No inspections recorded in this period."])

    # Wrap the free-text columns and give every column a sane width.
    widths = [12, 14, 22, 14, 12, 12, 26, 14, 10, 26, 14, 40, 40, 12, 11]
    for i, w in enumerate(widths, start=1):
        ws.column_dimensions[get_column_letter(i)].width = w
    wrap = Alignment(wrap_text=True, vertical="top")
    for r in range(header_row_idx + 1, ws.max_row + 1):
        for col in (10, 12, 13):
            ws.cell(row=r, column=col).alignment = wrap
    ws.freeze_panes = ws.cell(row=header_row_idx + 1, column=1)

    note = wb.create_sheet("Notes")
    note["A1"] = "Notes and limitations"
    note["A1"].font = Font(bold=True)
    note["A2"] = DISCLAIMER.format(rules_as_at=report_date.strftime("%d %B %Y"))
    note["A2"].alignment = Alignment(wrap_text=True, vertical="top")
    note.column_dimensions["A"].width = 100

    wb.save(out_path)
    return out_path


def generate_daily_csv(inspector, report_date, blocks, chain_head: str,
                       out_path: Path, period_label: str | None = None) -> Path:
    """CSV export. UTF-8 with BOM so Excel opens the °/₹/— glyphs correctly."""
    import csv

    with open(out_path, "w", newline="", encoding="utf-8-sig") as fh:
        w = csv.writer(fh)
        w.writerow(["NiyamNetra — Inspection Report"])
        w.writerow(["Inspector", f"{inspector.full_name} ({inspector.employee_id})"])
        w.writerow(["Period" if period_label else "Date",
                    period_label or report_date.strftime("%Y-%m-%d")])
        w.writerow(["Inspections", len(blocks)])
        w.writerow(["Audit chain head", chain_head[:32] or "EMPTY"])
        w.writerow([])
        w.writerow(list(_SPREADSHEET_COLUMNS))
        rows = _daily_rows(blocks)
        if not rows:
            w.writerow(["No inspections recorded in this period."])
        for row in rows:
            w.writerow(row)
    return out_path
