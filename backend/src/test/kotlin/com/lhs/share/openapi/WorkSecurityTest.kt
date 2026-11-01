package com.lhs.share.openapi

import com.lhs.share.hub.work.model.WorkPageResponse
import com.lhs.share.hub.work.service.WorkService
import org.junit.jupiter.api.Test
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.http.MediaType
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@org.springframework.test.context.ActiveProfiles("test")
@SpringBootTest(
    properties = [
        "spring.data.mongodb.uri=mongodb://127.0.0.1:1/yuanhub_test_unit?serverSelectionTimeoutMS=50&connectTimeoutMS=50",
        "spring.data.mongodb.auto-index-creation=false",
    ],
)
@AutoConfigureMockMvc
class WorkSecurityTest {
    @org.springframework.test.context.bean.override.mockito.MockitoBean
    lateinit var betaService: com.lhs.share.hub.service.beta.BetaService

    @Autowired
    lateinit var mockMvc: MockMvc

    @MockitoBean
    lateinit var service: WorkService

    @Test
    fun `public reads and preview stay public while native mutations require jwt`() {
        `when`(service.list(1, 20)).thenReturn(WorkPageResponse(1, 20, 0, false, emptyList()))

        mockMvc.perform(get("/v1/works"))
            .andExpect(status().isOk)
        mockMvc.perform(
            post("/v1/works/compatibility?to=MAAYUAN")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"),
        ).andExpect(status().isBadRequest)

        mockMvc.perform(get("/v1/works/mine"))
            .andExpect(status().isUnauthorized)
        mockMvc.perform(post("/v1/works").contentType(MediaType.APPLICATION_JSON).content("{}"))
            .andExpect(status().isUnauthorized)
        mockMvc.perform(
            put("/v1/works/w_66ed00000000000000000001")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"),
        )
            .andExpect(status().isUnauthorized)
        mockMvc.perform(
            post("/v1/works/w_66ed00000000000000000001/publish")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"),
        )
            .andExpect(status().isUnauthorized)
        mockMvc.perform(
            post("/v1/works/w_66ed00000000000000000001/unpublish")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"),
        )
            .andExpect(status().isUnauthorized)
        mockMvc.perform(
            delete("/v1/works/w_66ed00000000000000000001")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}"),
        )
            .andExpect(status().isUnauthorized)
    }
}
