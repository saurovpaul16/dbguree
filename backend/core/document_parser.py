import re


class UnsupportedFileTypeError(ValueError):
    pass


class DocumentParser:
    """
    Extracts plain text from uploaded documents.
    Supported types: pdf, docx, md, txt.
    """

    def parse(self, file_path: str, file_type: str) -> str:
        handler = {
            "pdf": self._parse_pdf,
            "docx": self._parse_docx,
            "md": self._parse_markdown,
            "txt": self._parse_txt,
        }.get(file_type.lower())

        if handler is None:
            raise UnsupportedFileTypeError(
                f"Unsupported file type: {file_type!r}. "
                "Supported: pdf, docx, md, txt"
            )
        return handler(file_path)

    def _parse_pdf(self, path: str) -> str:
        from pypdf import PdfReader

        reader = PdfReader(path)
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages)

    def _parse_docx(self, path: str) -> str:
        from docx import Document

        doc = Document(path)
        return "\n".join(para.text for para in doc.paragraphs)

    def _parse_markdown(self, path: str) -> str:
        from markdown_it import MarkdownIt

        md = MarkdownIt()
        with open(path, encoding="utf-8") as f:
            content = f.read()
        html = md.render(content)
        # Strip HTML tags to get plain text for embedding
        plain = re.sub(r"<[^>]+>", " ", html)
        return re.sub(r"\s+", " ", plain).strip()

    def _parse_txt(self, path: str) -> str:
        with open(path, encoding="utf-8") as f:
            return f.read()
