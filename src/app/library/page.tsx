'use client';

import { ChangeEvent, useMemo, useState } from 'react';
import { BookOpen, Loader2 } from 'lucide-react';
import BookCard from '@/components/Store/BookCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardTitle } from '@/components/ui/card';
import { CustomBook, Language, useAppStore } from '@/lib/store';
import demoBooks from '@/data/demo-books.json';

const FALLBACK_COVER = '/covers/great-gatsby.jpg';
const FALLBACK_AUTHOR = 'Unknown author';
const MIN_UPLOAD_PREVIEW_MS = 700;

type ImportedBook = {
  title?: string;
  author?: string;
  cover?: string;
  language?: string;
  text?: string;
  chapters?: Array<{ title?: string | Record<string, string>; content?: string | Record<string, string> }>;
};

type UploadingPreview = {
  id: string;
  title: string;
  author: string;
};

const parseTextToBook = (text: string, fileName: string): CustomBook => {
  const baseName = fileName.replace(/\.[^/.]+$/, '');
  const title = baseName || 'Uploaded Book';

  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    author: FALLBACK_AUTHOR,
    cover: FALLBACK_COVER,
    languages: ['en'],
    chapters: [
      {
        number: 1,
        title: 'Chapter 1',
        content: {
          en: text || 'Empty file.',
          fr: text || 'Empty file.',
          es: text || 'Empty file.',
          de: text || 'Empty file.',
          ru: text || 'Empty file.'
        }
      }
    ],
    isCustom: true
  };
};

const parseJsonToBook = (raw: string, fileName: string): CustomBook => {
  const data = JSON.parse(raw) as ImportedBook;
  const fallback = parseTextToBook(data.text || '', fileName);

  const language = (data.language || 'en') as Language;
  const supportedLanguages: Language[] = ['en', 'fr', 'es', 'de', 'ru'];
  const normalizedLanguage = supportedLanguages.includes(language) ? language : 'en';

  const chapters = (data.chapters || []).map((chapter, index) => {
    const contentByLanguage: Record<Language, string> = {
      en: '',
      fr: '',
      es: '',
      de: '',
      ru: ''
    };

    if (typeof chapter.content === 'string') {
      contentByLanguage[normalizedLanguage] = chapter.content;
      if (!contentByLanguage.en) {
        contentByLanguage.en = chapter.content;
      }
    }

    if (chapter.content && typeof chapter.content === 'object') {
      for (const [langKey, value] of Object.entries(chapter.content)) {
        if (supportedLanguages.includes(langKey as Language) && typeof value === 'string') {
          contentByLanguage[langKey as Language] = value;
        }
      }
      if (!contentByLanguage.en) {
        contentByLanguage.en = Object.values(contentByLanguage).find(Boolean) || '';
      }
    }

    const titleByLanguage: Partial<Record<Language, string>> = {};
    if (chapter.title && typeof chapter.title === 'object') {
      for (const [langKey, value] of Object.entries(chapter.title)) {
        if (supportedLanguages.includes(langKey as Language) && typeof value === 'string' && value.trim()) {
          titleByLanguage[langKey as Language] = value;
        }
      }
    }

    return {
      number: index + 1,
      title: typeof chapter.title === 'string' && chapter.title.trim()
        ? chapter.title
        : (Object.keys(titleByLanguage).length > 0 ? titleByLanguage : `Chapter ${index + 1}`),
      content: contentByLanguage
    };
  });

  return {
    ...fallback,
    title: data.title || fallback.title,
    author: data.author || FALLBACK_AUTHOR,
    cover: data.cover || FALLBACK_COVER,
    languages: (() => {
      const parsedLanguages = Array.from(new Set(chapters.flatMap((chapter) =>
        Object.entries(chapter.content)
          .filter(([, value]) => Boolean(value))
          .map(([lang]) => lang as Language)
      )));
      return parsedLanguages.length > 0 ? parsedLanguages : ['en'];
    })(),
    chapters: chapters.length > 0 ? chapters : fallback.chapters,
  };
};

export default function LibraryPage() {
  const [filterMode, setFilterMode] = useState<'all' | 'visible' | 'hidden'>('visible');
  const [uploadingPreview, setUploadingPreview] = useState<UploadingPreview | null>(null);
  const { progress, customBooks, hiddenBookIds, addCustomBook, hideBook, unhideBook, deleteBook } = useAppStore();
  const customBookIds = useMemo(() => new Set(customBooks.map((book) => book.id)), [customBooks]);
  const allBooks = useMemo(() => [...customBooks, ...demoBooks.books], [customBooks]);
  const hiddenBookIdSet = useMemo(() => new Set(hiddenBookIds), [hiddenBookIds]);

  const visibleBooks = useMemo(
    () => allBooks.filter((book) => !hiddenBookIds.includes(book.id)),
    [allBooks, hiddenBookIds]
  );
  const hiddenBooks = useMemo(
    () => allBooks.filter((book) => hiddenBookIds.includes(book.id)),
    [allBooks, hiddenBookIds]
  );
  const filteredBooks = useMemo(() => {
    if (filterMode === 'all') {
      return allBooks;
    }
    if (filterMode === 'visible') {
      return visibleBooks;
    }
    return hiddenBooks;
  }, [allBooks, filterMode, hiddenBooks, visibleBooks]);

  const lastReadBook = Object.entries(progress)
    .sort((a, b) => new Date(b[1].lastRead).getTime() - new Date(a[1].lastRead).getTime())[0];

  const lastBook = lastReadBook
    ? visibleBooks.find((b) => b.id === lastReadBook[0])
    : null;

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const previewStartedAt = Date.now();
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    setUploadingPreview({
      id: `uploading-${Date.now()}`,
      title: baseName || 'Uploaded Book',
      author: FALLBACK_AUTHOR
    });

    try {
      const content = await file.text();
      const extension = file.name.split('.').pop()?.toLowerCase();

      const book = extension === 'json'
        ? parseJsonToBook(content, file.name)
        : parseTextToBook(content, file.name);

      addCustomBook(book);
    } catch (error) {
      console.error('Failed to upload book', error);
      alert('Could not import this file. Use TXT, MD, or JSON.');
    } finally {
      const elapsed = Date.now() - previewStartedAt;
      if (elapsed < MIN_UPLOAD_PREVIEW_MS) {
        await new Promise((resolve) => setTimeout(resolve, MIN_UPLOAD_PREVIEW_MS - elapsed));
      }
      setUploadingPreview(null);
      event.target.value = '';
    }
  };

  const handleDelete = (bookId: string) => {
    if (customBookIds.has(bookId)) {
      deleteBook(bookId);
      return;
    }

    hideBook(bookId);
  };

  const showUploadingCard = Boolean(uploadingPreview) && filterMode !== 'hidden';
  const hasBooksInGrid = filteredBooks.length > 0 || showUploadingCard;

  return (
    <div className="min-h-screen bg-background">
      <header className="pt-[env(safe-area-inset-top)] sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b">
        <div className="container max-w-2xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Library</h1>
          <>
            <input
              id="book-upload-input"
              type="file"
              accept=".txt,.md,.json"
              className="sr-only"
              onChange={handleUpload}
            />
            {/*
            <Button
              asChild
              size="sm"
              className="rounded-[var(--radius-pill)] px-4"
            >
              <label htmlFor="book-upload-input">Add book</label>
            </Button>
            */}
          </>
        </div>
      </header>

      <div className="container max-w-2xl mx-auto px-4 sm:px-6 pt-8 pb-4 space-y-6">
        <section>
          <div className="inline-flex items-center gap-1 rounded-lg border bg-background p-1">
            <Button
              type="button"
              size="sm"
              variant={filterMode === 'visible' ? 'secondary' : 'ghost'}
              onClick={() => setFilterMode('visible')}
            >
              Visible
            </Button>
            <Button
              type="button"
              size="sm"
              variant={filterMode === 'hidden' ? 'secondary' : 'ghost'}
              onClick={() => setFilterMode('hidden')}
            >
              Hidden
            </Button>
            <Button
              type="button"
              size="sm"
              variant={filterMode === 'all' ? 'secondary' : 'ghost'}
              onClick={() => setFilterMode('all')}
            >
              All
            </Button>
          </div>
        </section>

        {filterMode === 'visible' && lastBook && lastReadBook && (
          <section>
            <h2 className="flex items-center gap-2 text-lg font-semibold mb-4">
              <BookOpen className="w-5 h-5 text-primary" />
              Continue Reading
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <BookCard
                id={lastBook.id}
                title={lastBook.title}
                author={lastBook.author}
                cover={lastBook.cover}
                progress={progress[lastBook.id]?.progress || 0}
                onHide={hideBook}
                onDelete={handleDelete}
                hideLabel="Hide"
              />
            </div>
          </section>
        )}

        <section>
          <h2 className="text-lg font-semibold mb-4">
            {filterMode === 'all' ? 'All Books' : filterMode === 'hidden' ? 'Hidden Books' : 'Visible Books'}
          </h2>
          {!hasBooksInGrid ? (
            <p className="text-sm text-muted-foreground">
              {filterMode === 'all'
                ? 'No books yet.'
                : filterMode === 'hidden'
                  ? 'No hidden books yet.'
                  : 'No visible books yet.'}
            </p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              {showUploadingCard && uploadingPreview && (
                <Card key={uploadingPreview.id} className="w-full opacity-90 pointer-events-none">
                  <CardContent className="p-3">
                    <div className="aspect-[2/3] rounded-md bg-muted mb-2 flex flex-col items-center justify-center gap-2">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">Uploading...</span>
                    </div>
                    <CardTitle className="text-sm mb-1 line-clamp-2">{uploadingPreview.title}</CardTitle>
                    <CardDescription className="text-xs line-clamp-1">
                      {uploadingPreview.author}
                    </CardDescription>
                  </CardContent>
                </Card>
              )}
              {filteredBooks.map((book) => {
                const isHidden = hiddenBookIdSet.has(book.id);
                return (
                  <BookCard
                    key={book.id}
                    id={book.id}
                    title={book.title}
                    author={book.author}
                    cover={book.cover}
                    progress={progress[book.id]?.progress || 0}
                    onHide={isHidden ? unhideBook : hideBook}
                    onDelete={handleDelete}
                    hideLabel={isHidden ? 'Unhide' : 'Hide'}
                  />
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
