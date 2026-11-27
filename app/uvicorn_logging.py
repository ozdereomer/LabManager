import copy

from app.logging_config import JsonFormatter


class UvicornJsonFormatter(JsonFormatter):
    def format(self, record):
        safe_record = copy.copy(record)

        if record.exc_info or record.exc_text:
            safe_record.msg = "server_exception"
            safe_record.args = ()

            if record.exc_info and record.exc_info[0]:
                safe_record.error_type = record.exc_info[0].__name__

        safe_record.exc_info = None
        safe_record.exc_text = None
        safe_record.stack_info = None

        return super().format(safe_record)
