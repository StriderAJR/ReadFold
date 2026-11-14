import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { ListChecks } from 'lucide-react';
import { useAppData, PageTitle } from './Common';
import { scheduleReview, type ReviewRating } from '../domain/review';
import { buildQuiz, checkAnswer, type QuizKind, type QuizTask } from '../domain/quiz';
export function ReviewsPage() {
  const { t } = useTranslation();
  const { user, dictionary } = useAppData();
  const tasks = useMemo(() => (dictionary.data ? buildQuiz(dictionary.data) : []), [dictionary.data]);
  const [taskKind, setTaskKind] = useState<'all' | QuizKind>('all');
  const selectedTasks = tasks.filter((task) => taskKind === 'all' || task.kind === taskKind);
  const reviewData = user.data?.reviews ?? [];
  const latest = new Map<string, (typeof reviewData)[number]>();
  reviewData.forEach((operation) => latest.set(operation.entityId, operation));
  const due = selectedTasks
    .filter((task, index) => {
      const previous = latest.get(task.entityId);
      const seen = Boolean(user.data?.learning[task.entityId] || previous);
      const notDuplicated = !tasks.slice(0, index).some((item) => item.entityId === task.entityId);
      return seen && notDuplicated && (!previous || Number(previous.payload.dueAt ?? 0) <= Date.now());
    })
    .slice(0, user.preferences.dailyReviewLimit);
  const [queue, setQueue] = useState<QuizTask[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [checked, setChecked] = useState(false);
  const [sessionStarted, setSessionStarted] = useState(false);
  const [saving, setSaving] = useState(false);
  const submissionLock = useRef(false);
  const current = queue[index];

  function start(includeNew = false) {
    setQueue(includeNew ? selectedTasks : due);
    setIndex(0);
    setAnswer('');
    setChecked(false);
    setSessionStarted(true);
  }
  async function rate(rating: ReviewRating) {
    if (!current || submissionLock.current) {
      return;
    }
    submissionLock.current = true;
    setSaving(true);
    try {
      const previous = latest.get(current.entityId);
      const correct = checkAnswer(current, answer);
      const finalRating: ReviewRating = correct ? rating : 'again';
      const schedule = scheduleReview(
        previous
          ? {
              repetitions: Number(previous.payload.repetitions ?? 0),
              intervalDays: Number(previous.payload.intervalDays ?? 0),
              dueAt: Number(previous.payload.dueAt ?? 0),
            }
          : undefined,
        finalRating,
        Date.now(),
      );
      const saved = await user.save({
        kind: 'review',
        id: current.entityId,
        payload: {
          rating: finalRating,
          correct,
          reviewedAt: new Date().toISOString(),
          ...schedule,
          taskId: current.id,
        },
      });
      if (!saved) {
        return;
      }
      if (correct && schedule.repetitions >= 3) {
        await user.save({ kind: 'learning', id: current.entityId, payload: { status: 'mastered' } });
      }
      setIndex((value) => value + 1);
      setAnswer('');
      setChecked(false);
    } finally {
      submissionLock.current = false;
      setSaving(false);
    }
  }

  if (dictionary.isLoading) {
    return <p className="loading-line">{t('loading')}</p>;
  }
  if (dictionary.isError) {
    return (
      <Card className="state-card">
        {t('error')}{' '}
        <Button variant="outline" onClick={() => void dictionary.refetch()}>
          {t('retry')}
        </Button>
      </Card>
    );
  }
  return (
    <>
      <PageTitle title={t('reviews')}>
        <span className="count-pill">{due.length}</span>
      </PageTitle>
      <label className="review-type">
        <span>{t('reviewType')}</span>
        <select value={taskKind} onChange={(event) => setTaskKind(event.target.value as 'all' | QuizKind)}>
          {(['all', 'meaning', 'reading', 'translation', 'kanji', 'grammar'] as const).map((kind) => (
            <option key={kind} value={kind}>
              {t(kind)}
            </option>
          ))}
        </select>
      </label>
      {current ? (
        <div className="review-stage">
          <div className="review-progress">
            <span style={{ width: `${(index / queue.length) * 100}%` }} />
          </div>
          <p className="eyebrow">
            {index + 1} / {queue.length} · {t(current.kind)}
          </p>
          <div className="review-prompt">{current.prompt}</div>
          <p className="muted">{t(`prompt_${current.kind}`)}</p>
          {current.options.length ? (
            <div className="answer-grid">
              {current.options.map((option) => (
                <button
                  key={option}
                  disabled={checked}
                  onClick={() => setAnswer(option)}
                  className={`answer-option ${answer === option ? 'picked' : ''} ${checked && option === current.answer ? 'correct' : ''} ${checked && answer === option && !checkAnswer(current, answer) ? 'incorrect' : ''}`}
                >
                  {option}
                </button>
              ))}
            </div>
          ) : (
            <input
              className="answer-input"
              value={answer}
              onChange={(event) => setAnswer(event.target.value)}
              aria-label={t('chooseAnswer')}
            />
          )}
          {!checked ? (
            <Button disabled={!answer} onClick={() => setChecked(true)}>
              {t('save')}
            </Button>
          ) : (
            <div className="rating-row">
              {(['again', 'hard', 'good', 'easy'] as ReviewRating[]).map((rating) => (
                <Button key={rating} variant="outline" disabled={saving} onClick={() => void rate(rating)}>
                  {t(rating)}
                </Button>
              ))}
            </div>
          )}
        </div>
      ) : sessionStarted ? (
        <Card className="state-card">
          {t('done')}{' '}
          <Button onClick={() => start(true)}>
            {t('reviewStart')} · {tasks.length}
          </Button>
        </Card>
      ) : (
        <div className="review-start">
          <Card>
            <span className="promo-icon">
              <ListChecks />
            </span>
            <p className="eyebrow">{t('dailyPractice')}</p>
            <h2>{due.length ? `${due.length} ${t('due')}` : t('done')}</h2>
            <p className="muted">{t('noReviews')}</p>
            <Button onClick={() => start()} disabled={!due.length}>
              {t('reviewStart')}
            </Button>
            <Button variant="ghost" onClick={() => start(true)} disabled={!selectedTasks.length}>
              {t('all')} · {selectedTasks.length}
            </Button>
          </Card>
          <Card className="review-summary">
            <h3>{t('reviewHistory')}</h3>
            {reviewData.length ? (
              reviewData
                .slice(-12)
                .reverse()
                .map((operation) => (
                  <div className="history-row" key={operation.id}>
                    <span>{operation.entityId}</span>
                    <b>{t(String(operation.payload.rating))}</b>
                    <small>{new Date(operation.createdAt).toLocaleDateString()}</small>
                  </div>
                ))
            ) : (
              <p className="muted">{t('noHistory')}</p>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
export function StatisticsPage() {
  const { t } = useTranslation();
  const { catalog, user } = useAppData();
  const readings = user.data?.readings ?? {};
  const learning = user.data?.learning ?? {};
  const reviews = user.data?.reviews ?? [];
  const completedChapters = Object.entries(readings).filter(([key, progress]) => {
    const [bookId, chapterId] = key.split('/');
    const chapter = catalog.data?.find((book) => book.id === bookId)?.chapters.find((item) => item.id === chapterId);
    return chapter && progress.sentenceIds.length >= chapter.sentenceCount;
  }).length;
  const reviewed = reviews.length;
  const answers = reviews.filter((operation) => typeof operation.payload.correct === 'boolean');
  const correct = answers.filter((operation) => operation.payload.correct === true).length;
  const daily = new Map<string, { sentences: Set<string>; answers: number; correct: number }>();
  for (const operation of user.data?.operations ?? []) {
    if (operation.entityKind !== 'reading' && operation.entityKind !== 'review') {
      continue;
    }
    const date = new Date(operation.createdAt);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const row = daily.get(day) ?? { sentences: new Set<string>(), answers: 0, correct: 0 };
    if (operation.entityKind === 'reading') {
      row.sentences.add(`${operation.entityId}/${String(operation.payload.sentenceId)}`);
    } else if (typeof operation.payload.correct === 'boolean') {
      row.answers++;
      if (operation.payload.correct) {
        row.correct++;
      }
    }
    daily.set(day, row);
  }
  const stats: [string, number, string][] = [
    [
      t('booksRead'),
      new Set(Object.keys(readings).map((key) => key.split('/')[0])).size,
      `${completedChapters} ${t('completedChapters').toLowerCase()}`,
    ],
    [
      t('sentencesRead'),
      Object.values(readings).reduce((sum, progress) => sum + progress.sentenceIds.length, 0),
      t('progress'),
    ],
    [t('masteredCount'), Object.values(learning).filter((status) => status === 'mastered').length, t('masteredCount')],
    [t('encounteredCount'), Object.keys(learning).length, t('encounteredCount')],
    [
      t('words'),
      Object.keys(learning).filter((id) => id.startsWith('ja:word:')).length,
      t('words'),
    ],
    [t('kanji'), Object.keys(learning).filter((id) => id.startsWith('ja:kanji:')).length, t('kanji')],
    [t('grammar'), Object.keys(learning).filter((id) => id.startsWith('ja:grammar:')).length, t('grammar')],
    [
      t('knownWords'),
      Object.entries(learning).filter(
        ([id, status]) =>
          id.startsWith('ja:word:') && (status === 'known' || status === 'mastered'),
      ).length,
      t('known'),
    ],
    [
      t('learningKanji'),
      Object.entries(learning).filter(([id, status]) => id.startsWith('ja:kanji:') && status === 'learning').length,
      t('markLearning'),
    ],
    [
      t('learnedGrammar'),
      Object.entries(learning).filter(
        ([id, status]) => id.startsWith('ja:grammar:') && (status === 'known' || status === 'mastered'),
      ).length,
      t('known'),
    ],
    [
      t('reviewAccuracy'),
      answers.length ? Math.round((correct / answers.length) * 100) : 0,
      `${reviewed} ${t('reviewed').toLowerCase()}`,
    ],
  ];
  return (
    <>
      <PageTitle title={t('statsTitle')} />
      <div className="stats-grid">
        {stats.map(([name, value, note]) => (
          <Card key={name} className="stat-card">
            <span>{name}</span>
            <b>{name === t('reviewAccuracy') ? (answers.length ? `${value}%` : t('noData')) : value}</b>
            <i>{note}</i>
          </Card>
        ))}
      </div>
      <Card className="statistics-panel">
        <h2>{t('activity')}</h2>
        {daily.size ? (
          <div className="activity-table">
            <table>
              <thead>
                <tr>
                  <th>{t('date')}</th>
                  <th>{t('sentencesRead')}</th>
                  <th>{t('reviewAccuracy')}</th>
                </tr>
              </thead>
              <tbody>
                {[...daily]
                  .sort(([left], [right]) => right.localeCompare(left))
                  .slice(0, 14)
                  .map(([day, row]) => (
                    <tr key={day}>
                      <td>{day}</td>
                      <td>{row.sentences.size}</td>
                      <td>
                        {row.answers
                          ? `${row.correct} / ${row.answers} · ${Math.round((100 * row.correct) / row.answers)}%`
                          : '—'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted">{t('noHistory')}</p>
        )}
        <h2>{t('progress')}</h2>
        {catalog.data?.map((book) => {
          const count = book.chapters.reduce(
            (sum, chapter) => sum + (readings[`${book.id}/${chapter.id}`]?.sentenceIds.length ?? 0),
            0,
          );
          const total = book.chapters.reduce((sum, chapter) => sum + chapter.sentenceCount, 0);
          return (
            <div className="stat-book" key={book.id}>
              <span>{book.title}</span>
              <b>
                {count} / {total}
              </b>
              <div className="progress-line">
                <span style={{ width: `${total ? Math.min(100, (count / total) * 100) : 0}%` }} />
              </div>
            </div>
          );
        })}
        <h3>{t('reviewHistory')}</h3>
        {reviews.length ? (
          reviews
            .slice(-20)
            .reverse()
            .map((operation) => (
              <div className="history-row" key={operation.id}>
                <span>{operation.entityId}</span>
                <b>{t(String(operation.payload.rating))}</b>
                <small>{new Date(operation.createdAt).toLocaleDateString()}</small>
              </div>
            ))
        ) : (
          <p className="muted">{t('noHistory')}</p>
        )}
      </Card>
    </>
  );
}
