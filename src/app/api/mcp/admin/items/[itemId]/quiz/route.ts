import { NextRequest } from "next/server";
import { handleAdminRead, handleAdminWrite, readJsonBody } from "@/app/api/mcp/admin/_lib/handlers";
import { ApiError, jsonSuccess } from "@/app/api/mcp/admin/_lib/response";
import { mcpAdminMutation, mcpAdminQuery } from "@/app/api/mcp/admin/_lib/service";
import {
  ensureArray,
  ensureObject,
  ensureString,
  optionalNumber,
  optionalString,
} from "@/app/api/mcp/admin/_lib/validation";

type QuizQuestionPayload = {
  questionText: string;
  options: string[];
  correctAnswer: string;
  explanation?: string;
};

function parseQuestions(input: unknown): QuizQuestionPayload[] {
  return ensureArray(input, "questions").map((entry, index) => {
    const question = ensureObject(entry, `questions[${index}]`);
    const options = ensureArray(question.options, `questions[${index}].options`).map((option, optionIndex) =>
      ensureString(option, `questions[${index}].options[${optionIndex}]`),
    );
    if (options.length !== 4) {
      throw new ApiError(400, "BAD_REQUEST", `questions[${index}] must include exactly 4 options`);
    }
    return {
      questionText: ensureString(question.questionText, `questions[${index}].questionText`),
      options,
      correctAnswer: ensureString(question.correctAnswer, `questions[${index}].correctAnswer`),
      explanation: optionalString(question.explanation, `questions[${index}].explanation`),
    };
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  return handleAdminRead(req, async () => {
    const { itemId } = await params;
    const quizData = await mcpAdminQuery<unknown>("getItemAttachedQuiz", { itemId });
    return jsonSuccess(quizData);
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  return handleAdminWrite(req, async () => {
    const { itemId } = await params;
    const body = await readJsonBody(req);
    const result = await mcpAdminMutation<{ quizId: string; questionCount: number }>(
      "saveItemAttachedQuiz",
      {
        itemId,
        title: ensureString(body.title, "title"),
        passing_score: optionalNumber(body.passing_score, "passing_score"),
        questions: parseQuestions(body.questions),
        source: optionalString(body.source, "source") ?? "chatgpt-mcp",
        action: "publish",
      },
    );
    return jsonSuccess(
      { itemId, quizId: result.quizId, questionCount: result.questionCount, status: "published" },
      201,
    );
  }, 1_000_000);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ itemId: string }> },
) {
  return handleAdminWrite(req, async () => {
    const { itemId } = await params;
    const body = await readJsonBody(req);
    const result = await mcpAdminMutation<{ quizId: string; questionCount: number }>(
      "saveItemAttachedQuiz",
      {
        itemId,
        title: ensureString(body.title, "title"),
        passing_score: optionalNumber(body.passing_score, "passing_score"),
        questions: parseQuestions(body.questions),
        source: optionalString(body.source, "source") ?? "chatgpt-mcp",
        action: "update",
      },
    );
    return jsonSuccess({ itemId, quizId: result.quizId, questionCount: result.questionCount, status: "updated" });
  }, 1_000_000);
}
