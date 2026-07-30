import { ChatbotService } from './chatbot.service.js';
import { sanitizeQuestion, validateQuestion } from './chatbot.guard.js';

export async function sendMessage(req, res) {
  const question = sanitizeQuestion(req.body?.question);
  const validation = validateQuestion(question);

  if (!validation.ok) {
    return res.status(validation.outOfScope ? 200 : 400).json({
      ok: validation.outOfScope,
      message: validation.error,
      outOfScope: Boolean(validation.outOfScope)
    });
  }

  try {
    const answer = await ChatbotService.answer({
      question,
      location: req.body?.location
    });
    res.json({ ok: true, ...answer });
  } catch (error) {
    console.error(error);
    res.status(500).json({ ok: false, error: 'Error procesando la consulta del chatbot' });
  }
}
