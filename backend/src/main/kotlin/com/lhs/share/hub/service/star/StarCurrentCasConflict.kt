package com.lhs.share.hub.service.star

import com.mongodb.MongoException
import org.springframework.dao.DataAccessException
import org.springframework.dao.DuplicateKeyException

/** Maps only known Mongo CAS races to the caller's stable revision-conflict response. */
internal inline fun <T> starCasConflictBoundary(conflict: () -> Nothing, action: () -> T): T = try {
    action()
} catch (_: DuplicateKeyException) {
    conflict()
} catch (error: MongoException) {
    if (error.code == 112 || error.hasErrorLabel("TransientTransactionError")) conflict()
    throw error
} catch (error: DataAccessException) {
    if (generateSequence<Throwable>(error) { it.cause }.filterIsInstance<MongoException>().any {
            it.code == 112 || it.hasErrorLabel("TransientTransactionError")
        }
    ) {
        conflict()
    }
    throw error
}
