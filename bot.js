require('dotenv').config();
const {Bot, session, InlineKeyboard} = require('grammy');
const schedule = require("node-schedule")
const {
    addLesson, getLessonsByDay, 
    addHomework, getHomeworksByLesson, 
    deleteHomework, clearOldHomeworks,deleteLesson, 
} = require("./db");

// -------------------------------------

const bot = new Bot(process.env.BOT_TOKEN);
const dayNames = ["", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const ALLOWED_USERS = [1300075799,1663159343,7035521464,];
const OWNER_ID = 1300075799; 
const GROUP_ID = -1004453157797;







//----------------------------------------------------------------
bot.use(async (ctx, next) => {
    if (ctx.chat && (ctx.chat.type === "group" || ctx.chat.type === "supergroup")) {
        
        if (ctx.callbackQuery) {
            await ctx.answerCallbackQuery().catch(() => {});
            return; 
        }


        if (ctx.message && ctx.message.text && ctx.message.text.startsWith("/")) {
            
            await ctx.reply(" Я работаю только в личных сообщениях! Нажми на мое имя и напиши мне в личку.", {
                reply_to_message_id: ctx.message.message_id // Отвечаем на сообщение пользователя
            });
            
            return; 
        }

        return;
    }

    return next();
});










bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    
    if (!ALLOWED_USERS.includes(userId)) {
        console.log(`запрет для ID: ${userId}`);
        
        if (ctx.chat.type === "private") {
            await ctx.reply("Я работаю только для участников Space");
        }
        
        return; 
    }
    
    return next();
});




function getCurrentWeekId() {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 1);
    const diff = (now - start) + ((start.getTimezoneOffset() - now.getTimezoneOffset())*60*1000);
    const oneWeek = 1000*60*60*24*7;
    const weekNumber = Math.floor(diff/oneWeek) + 1;
    return `${now.getFullYear()}-${weekNumber}`;
};

async function showHomework(ctx, lessonId, day, isEditing = false) {
    const weekId = getCurrentWeekId();
    const homeworks = getHomeworksByLesson(lessonId, weekId);

    let message = `*Домашнее задание:*\n\n`;
    const photosToSend = [];
    const keyboard = new InlineKeyboard();

    if (homeworks.length === 0) {
        message += "Пока никто ничего не добавил.";
    } else {
        homeworks.forEach((hw, index) => {
            message += `${index + 1}. От ${hw.author_name}:\n`;
            if (hw.text) message += `${hw.text}\n`;
            
            if (hw.photo_id) photosToSend.push(hw.photo_id);

            if (hw.author_id === ctx.from.id) {
                keyboard.text(`🗑 Удалить ДЗ №${index + 1}`, `del_${hw.id}_${lessonId}_${day}`).row();
            }
            message += `\n`;
        });
    }

    keyboard.text("➕ Добавить ДЗ", `add_to_${lessonId}_${day}`).row()
            .text("<- Назад", `back_to_day_${day}`);

    if (isEditing) {
        await ctx.editMessageText(message, { reply_markup: keyboard, parse_mode: "Markdown" });
    } else {
        await ctx.reply(message, { reply_markup: keyboard, parse_mode: "Markdown" });
    }

    if (!ctx.session.sent_photos) ctx.session.sent_photos = [];

    for (const photoId of photosToSend) {
        const sentPhoto = await ctx.replyWithPhoto(photoId);
        ctx.session.sent_photos.push(sentPhoto.message_id); 
    }
}



// Функция для отправки расписания на завтра в группу
async function sendDailyDigest() {
    const now = new Date();
    let tomorrowDay = now.getDay() === 0 ? 1 : now.getDay() + 1; 
    
    const lessons = getLessonsByDay(tomorrowDay);
    const weekId = getCurrentWeekId();

    if (lessons.length === 0) {
        return; 
    }

    try {
        await bot.api.sendMessage(GROUP_ID, `*Расписание на завтра (${dayNames[tomorrowDay]}):*`, { parse_mode: "Markdown" });

        for (const lesson of lessons) {
            let message = `*${lesson.subject}*\n`;
            const photosToSend = [];
            
            const homeworks = getHomeworksByLesson(lesson.id, weekId);
            
            if (homeworks.length === 0) {
                message += `_Домашки нет_`;
            } else {
                homeworks.forEach((hw) => {
                    if (hw.text) message += ` ${hw.text}\n`;
                    if (hw.photo_id) {
                        photosToSend.push(hw.photo_id);
                    }
                });
            }

            await bot.api.sendMessage(GROUP_ID, message, { parse_mode: "Markdown" });

            for (const photoId of photosToSend) {
                await bot.api.sendPhoto(GROUP_ID, photoId);
            }
            
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        console.log(" Дайджест на завтра отправлен в группу!");
    } catch (error) {
        console.error("Ошибка при отправке дайджеста:", error);
    }
}





//  удаления отправленных фото
async function deleteSentPhotos(ctx) {
    if (ctx.session.sent_photos && ctx.session.sent_photos.length > 0) {
        for (const msgId of ctx.session.sent_photos) {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, msgId);
            } catch (e) {
            }
        }
        ctx.session.sent_photos = []; 
    }
}



bot.use(session({initial: () => ({step: null, hw_lesson_id: null, setup_day: null,}) }));

bot.command("start", async (ctx) =>{
    const text = 
   `Привет. Я бот для школы
Я помогаю с домашней работой, по предметам
и сразу же с решением для каждого из них.

<b>Как пользоваться?</b>

Для начала ты должен состоять в группе класса --> ...
После, тебе будет открыт доступ.

<b>Команды:</b>

/menu — Расписание по дням + домашнее задание с решением.

<b>OWNER (Для изменения расписания)</b>
/set_lessons — добавить предмет
/delete_lessons — удалить предмет
    `;
    await ctx.reply(text,{parse_mode: "HTML"});
});
bot.command("menu", async (ctx) => {
    const keyboard = new InlineKeyboard()
        .text("Понедельник", "day_1").text("Вторник", "day_2").text("Среда", "day_3").row()
        .text("Четверг", "day_4").text("Пятница", "day_5").row();

    await ctx.reply("Выбери день недели:", { reply_markup: keyboard });

})

// -------------------------------------------------------------------------

bot.callbackQuery(/^day_(\d)$/, async (ctx) => {
    const day = parseInt(ctx.match[1]);
    const lessons = getLessonsByDay(day);

    if (lessons.length === 0) {
        return ctx.answerCallbackQuery(`На ${dayNames[day]} расписания нет.`);
    }

    const keyboard = new InlineKeyboard();
    
    lessons.forEach(lesson => {
        keyboard.text(lesson.subject, `view_${lesson.id}_${day}`).row();
    });
    
    keyboard.text("<- Назад", "back_to_days");

    await ctx.editMessageText(`*${dayNames[day]}*\nВыбери предмет:`, {
        reply_markup: keyboard,
        parse_mode: "Markdown"
    });
});

bot.callbackQuery(/^view_(\d+)_(\d+)$/, async (ctx) => {
    await deleteSentPhotos(ctx);

    const lessonId = parseInt(ctx.match[1]);
    const day = parseInt(ctx.match[2]);

    await ctx.answerCallbackQuery();
    await showHomework(ctx, lessonId, day, true);
});

bot.callbackQuery(/^del_(\d+)_(\d+)_(\d+)$/, async (ctx) => {
    const homeworkId = parseInt(ctx.match[1]);
    const lessonId = parseInt(ctx.match[2]);
    const day = parseInt(ctx.match[3]);

    deleteHomework(homeworkId);
    await ctx.answerCallbackQuery("🗑 Удалено!");

    await showHomework(ctx, lessonId, day, true);
});


    bot.callbackQuery("back_to_days", async (ctx) => {
        await deleteSentPhotos(ctx); 
        const keyboard = new InlineKeyboard()
        .text("Понедельник", "day_1").text("Вторник", "day_2").text("Среда", "day_3").row()
        .text("Четверг", "day_4").text("Пятница", "day_5").row();


        await ctx.answerCallbackQuery();
        await ctx.editMessageText("Выбери день недели:", {
            reply_markup: keyboard,
        })
    });

bot.callbackQuery(/^back_to_day_(\d+)$/, async (ctx) => {
    await deleteSentPhotos(ctx); 
    const day = parseInt(ctx.match[1]);
    const lessons = getLessonsByDay(day);
    
    const keyboard = new InlineKeyboard();
    lessons.forEach(lesson => {
        keyboard.text(lesson.subject, `view_${lesson.id}_${day}`).row();
    });
    keyboard.text("<- назад", "back_to_days");

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(` *${dayNames[day]}*\nВыбери предмет:`, {
        reply_markup: keyboard,
        parse_mode: "Markdown"
    });
});

    

        bot.callbackQuery(/^add_to_(\d+)_(\d+)$/, async (ctx) => {
            ctx.session.hw_lesson_id = parseInt(ctx.match[1]);
            ctx.session.hw_day = parseInt(ctx.match[2]);
            ctx.session.step = "awaiting_hw";

            ctx.session.old_msg_id = ctx.callbackQuery.message.message_id;

            await ctx.answerCallbackQuery();
            
            const promptMsg = await ctx.reply("Отправь текст домашнего задания или прикрепи фото (решение):");
            ctx.session.prompt_msg_id = promptMsg.message_id; 
        });



    bot.command("set_lessons", async (ctx) => {
        if (ctx.chat.type !== "private") {
            return ctx.reply("настраивать расписание можно только после решение думы");
        }
    
        if (ctx.from.id !== OWNER_ID) {
            return ctx.reply("настраивать расписание можно только после решение думы");
        }
    
        const keyboard = new InlineKeyboard()
            .text("Пн", "setup_1").text("Вт", "setup_2").text("Ср", "setup_3").row()
            .text("Чт", "setup_4").text("Пт", "setup_5").row();
    
        await ctx.reply("Выбери день для добавления предмета:", { reply_markup: keyboard });
    });

    bot.command("delete_lessons", async (ctx) => {
    if (ctx.chat.type !== "private") {
        return ctx.reply("Удалять предметы можно только в личных сообщениях!");
    }
    if (ctx.from.id !== OWNER_ID) {
        return ctx.reply("OWNER");
    }

    const keyboard = new InlineKeyboard()
        .text("Пн", "del_day_1").text("Вт", "del_day_2").text("Ср", "del_day_3").row()
        .text("Чт", "del_day_4").text("Пт", "del_day_5").row();

    await ctx.reply("Выбери день недели, из которого хочешь удалить предмет:", { reply_markup: keyboard });
});


bot.callbackQuery(/^del_day_(\d)$/, async (ctx) => {
    const day = parseInt(ctx.match[1]);
    const lessons = getLessonsByDay(day);

    if (lessons.length === 0) {
        return ctx.answerCallbackQuery(`На ${dayNames[day]} нет предметов.`);
    }

    const keyboard = new InlineKeyboard();
    lessons.forEach(lesson => {
        keyboard.text(`🗑 ${lesson.subject}`, `del_lesson_${lesson.id}`).row();
    });

    await ctx.answerCallbackQuery();
    await ctx.editMessageText(`Выбери предмет для удаления (${dayNames[day]}):`, { reply_markup: keyboard });
});

bot.callbackQuery(/^del_lesson_(\d+)$/, async (ctx) => {
    const lessonId = parseInt(ctx.match[1]);
    
    deleteLesson(lessonId); 

    await ctx.answerCallbackQuery("🗑 Предмет удален!");
    
    const keyboard = new InlineKeyboard()
        .text("Пн", "del_day_1").text("Вт", "del_day_2").text("Ср", "del_day_3").row()
        .text("Чт", "del_day_4").text("Пт", "del_day_5").row();

    await ctx.editMessageText("Предмет удален. Выбери другой день для удаления:", { reply_markup: keyboard });
});


    bot.callbackQuery(/^setup_(\d)$/, async (ctx) => {
        // проверка на owner
        if (ctx.from.id !== OWNER_ID) {
            return ctx.answerCallbackQuery("с нет прав на это действие.");
        }
    
        ctx.session.setup_day = parseInt(ctx.match[1]);
        ctx.session.step = "setup_subject"; 
        
        await ctx.answerCallbackQuery();
        await ctx.reply(`Введи название предмета для ${dayNames[ctx.session.setup_day]}:`);
    });

// ------------------------------------------------------------------------------------------

bot.on("message:text", async (ctx) => {
    if (ctx.session.step === "awaiting_hw") {
        const authorName = ctx.from.first_name || "Ученик";
        const text = ctx.message.text;
        const lessonId = ctx.session.hw_lesson_id;
        const savedDay = ctx.session.hw_day || 1;
        const promptMsgId = ctx.session.prompt_msg_id; 
        const oldMsgId = ctx.session.old_msg_id; 

        addHomework(lessonId, ctx.from.id, authorName, text, null, getCurrentWeekId());

        ctx.session.step = null;
        ctx.session.hw_lesson_id = null;
        ctx.session.hw_day = null;
        ctx.session.prompt_msg_id = null;
        ctx.session.old_msg_id = null;

        const successMsg = await ctx.reply("✅ Текст добавлен в домашку!");

        setTimeout(async () => {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, successMsg.message_id);
                
                if (promptMsgId) {
                    await ctx.api.deleteMessage(ctx.chat.id, promptMsgId);
                }

                await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
                
                if (oldMsgId) {
                    await ctx.api.deleteMessage(ctx.chat.id, oldMsgId);
                }
                
                await showHomework(ctx, lessonId, savedDay, false); 
            } catch (e) {
                console.error("Не удалось удалить сообщение:", e);
            }
        }, 3000);
        return;
    }
    
    if (ctx.session.step === "setup_subject") {
        addLesson(ctx.session.setup_day, ctx.message.text);
        ctx.session.step = null;
        ctx.session.setup_day = null;
        await ctx.reply(`✅ Предмет "${ctx.message.text}" добавлен в расписание`);
        return;
    }
});

// ------------------------------------------------------------------------------------------

bot.on("message:photo", async (ctx) => {
    if (ctx.session.step === "awaiting_hw") {
        const lessonId = ctx.session.hw_lesson_id;
        const savedDay = ctx.session.hw_day || 1;
        const promptMsgId = ctx.session.prompt_msg_id;
        const oldMsgId = ctx.session.old_msg_id; 

        if (!lessonId) {
            ctx.session.step = null;
            return ctx.reply("Ошибка: не выбран предмет. Начни заново с меню.");
        }

        const authorName = ctx.from.first_name || "Ученик";
        const photoId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
        const text = ctx.message.caption || null;

        addHomework(lessonId, ctx.from.id, authorName, text, photoId, getCurrentWeekId());

        ctx.session.step = null;
        ctx.session.hw_lesson_id = null;
        ctx.session.hw_day = null;
        ctx.session.prompt_msg_id = null;
        ctx.session.old_msg_id = null;

        const successMsg = await ctx.reply("✅ добавлено!");

        setTimeout(async () => {
            try {
                await ctx.api.deleteMessage(ctx.chat.id, successMsg.message_id);
                
                if (promptMsgId) {
                    await ctx.api.deleteMessage(ctx.chat.id, promptMsgId);
                }

                await ctx.api.deleteMessage(ctx.chat.id, ctx.message.message_id);
                
                if (oldMsgId) {
                    await ctx.api.deleteMessage(ctx.chat.id, oldMsgId);
                }
                
                await showHomework(ctx, lessonId, savedDay, false); 
            } catch (e) {
                console.error("Не удалось удалить сообщение:", e);
            }
        }, 3000);
        return;
    }
});



async function startBot() {
    await bot.api.setMyCommands([
        { command: "start", description: "Ознакомление" },
        { command: "menu", description: "Показать расписание" },
        { command: "set_lessons", description: "Настроить предметы (OWNER)" },
        { command: "delete_lessons", description: "Удалить предметы (OWNER)" },
    ]);

    //  очистка по пятницам в 8:00
    schedule.scheduleJob('0 0 8 * * 5', async () => {
        console.log("🧹 Запущена очистка старых домашних заданий (Пятница, 8:00)...");
        const currentWeekId = getCurrentWeekId();
        try {
            clearOldHomeworks(currentWeekId);
            console.log(`Очистка завершена. Оставлены только домашки за неделю: ${currentWeekId}`);
            await bot.api.sendMessage(OWNER_ID, "🧹 Расписание на новую неделю очищено. Старая домашка удалена.");
        } catch (error) {
            console.error("Ошибка при очистке:", error);
        }
    });

    //  дайджест каждый день в 20:00 
    schedule.scheduleJob('* 20 * * *', async () => {
        console.log("Запуск вечернего дайджеста...");
        await sendDailyDigest();
    });

    bot.catch((err) => {
        const ctx = err.ctx;
        console.error(`Ошибка при обработке обновления ${ctx.update.update_id}:`);
        console.error(err.error);
    });

    bot.start();
    console.log("Бот запущен и слушает Tg");
}

startBot();