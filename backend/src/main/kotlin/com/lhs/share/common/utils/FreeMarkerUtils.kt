package com.lhs.share.common.utils

import freemarker.template.Configuration
import freemarker.template.TemplateException
import java.io.IOException
import java.io.StringWriter
import java.nio.charset.StandardCharsets
import java.util.Locale

/**
 * FreeMarker 邮件模板工具
 */
object FreeMarkerUtils {
    private val cfg = Configuration(Configuration.VERSION_2_3_32)

    init {
        cfg.setClassForTemplateLoading(FreeMarkerUtils::class.java, "/static/templates/ftlh")
        cfg.setEncoding(Locale.CHINA, StandardCharsets.UTF_8.name())
    }

    fun parseData(templateName: String, dataModel: Any?): String {
        return try {
            val template = cfg.getTemplate(templateName)
            val sw = StringWriter()
            template.process(dataModel, sw)
            sw.toString()
        } catch (e: IOException) {
            throw IllegalStateException("获取 freemarker 模板失败", e)
        } catch (e: TemplateException) {
            throw IllegalStateException("freemarker 模板处理失败", e)
        }
    }
}
