import { NextRequest } from "next/server";
import { handleAdminWrite, readJsonBody } from "@/app/api/mcp/admin/_lib/handlers";
import { ApiError, jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminMutation } from "@/app/api/mcp/admin/_lib/service";
import {
  ensureArray,
  ensureObject,
  ensureString,
  ensureSupportedNoteStyles,
  optionalBoolean,
  optionalNumber,
  optionalString,
} from "@/app/api/mcp/admin/_lib/validation";

function parseFlashcards(input: unknown) {
  return ensureArray(input, "flashcards").map((entry, index) => {
    const flashcard = ensureObject(entry, `flashcards[${index}]`);
    return {
      front: ensureString(flashcard.front, `flashcards[${index}].front`),
      back: ensureString(flashcard.back, `flashcards[${index}].back`),
    };
  });
}

function parseQuiz(input: unknown) {
  const quiz = ensureObject(input, "quiz");
  const questions = ensureArray(quiz.questions, "quiz.questions").map((entry, index) => {
    const question = ensureObject(entry, `quiz.questions[${index}]`);
    const options = ensureArray(question.options, `quiz.questions[${index}].options`).map((option, optionIndex) =>
      ensureString(option, `quiz.questions[${index}].options[${optionIndex}]`),
    );
    if (options.length !== 4) {
      throw new ApiError(400, "BAD_REQUEST", `quiz.questions[${index}] must include exactly 4 options`);
    }
    return {
      questionText: ensureString(question.questionText, `quiz.questions[${index}].questionText`),
      options,
      correctAnswer: ensureString(question.correctAnswer, `quiz.questions[${index}].correctAnswer`),
      explanation: optionalString(question.explanation, `quiz.questions[${index}].explanation`),
    };
  });

  return {
    title: ensureString(quiz.title, "quiz.title"),
    passing_score: optionalNumber(quiz.passing_score, "quiz.passing_score"),
    questions,
  };
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  return handleAdminWrite(req, async () => {
    const { itemId } = await params;
    const body = await readJsonBody(req);

    const clearDraft = optionalBoolean(body.clear_draft, "clear_draft");
    const source = optionalString(body.source, "source") ?? "chatgpt-mcp";

    const steps: Array<Record<string, unknown>> = [];
    let success = true;

    if (body.content_html !== undefined) {
      try {
        const contentHtml = ensureSupportedNoteStyles(
          ensureString(body.content_html, "content_html"),
          "content_html",
        );
        const noteResult = await mcpAdminMutation<{ noteId: string }>("upsertItemNoteContent", {
          itemId,
          content_html: contentHtml,
          clear_draft: clearDraft,
          source,
          action: "publish",
        });
        steps.push({ step: "note", status: "success", noteId: noteResult.noteId });
      } catch (error) {
        success = false;
        steps.push({
          step: "note",
          status: "failed",
          error: error instanceof Error ? error.message : "Failed to publish note",
        });
      }
    }

    if (body.flashcards !== undefined) {
      try {
        const flashcardsResult = await mcpAdminMutation<{ flashcardsCount: number }>("upsertItemFlashcards", {
          itemId,
          flashcards: parseFlashcards(body.flashcards),
          source,
          action: "publish",
        });
        steps.push({
          step: "flashcards",
          status: "success",
          flashcardsCount: flashcardsResult.flashcardsCount,
        });
      } catch (error) {
        success = false;
        steps.push({
          step: "flashcards",
          status: "failed",
          error: error instanceof Error ? error.message : "Failed to publish flashcards",
        });
      }
    }

    if (body.quiz !== undefined) {
      try {
        const quiz = parseQuiz(body.quiz);
        const quizResult = await mcpAdminMutation<{ quizId: string; questionCount: number }>(
          "saveItemAttachedQuiz",
          {
            itemId,
            title: quiz.title,
            passing_score: quiz.passing_score,
            questions: quiz.questions,
            source,
            action: "publish",
          },
        );
        steps.push({
          step: "quiz",
          status: "success",
          quizId: quizResult.quizId,
          questionCount: quizResult.questionCount,
        });
      } catch (error) {
        success = false;
        steps.push({
          step: "quiz",
          status: "failed",
          error: error instanceof Error ? error.message : "Failed to publish quiz",
        });
      }
    }

    return jsonSuccess({
      itemId,
      success,
      steps,
    });
  }, 2_000_000);
}
