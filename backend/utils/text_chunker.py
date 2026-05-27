class TextChunker:
    """Simple sliding-window text chunker by word count."""

    def chunk(
        self, text: str, chunk_size: int = 512, overlap: int = 64
    ) -> list[str]:
        words = text.split()
        if not words:
            return []

        chunks: list[str] = []
        start = 0
        while start < len(words):
            end = min(start + chunk_size, len(words))
            chunks.append(" ".join(words[start:end]))
            if end == len(words):
                break
            start += chunk_size - overlap

        return chunks
